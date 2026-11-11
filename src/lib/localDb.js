import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'madenci_db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch {}
}

const DEFAULT_DB = {
  families: [],
  family_members: [],
  items: [],
  notification_events: [],
  notification_preferences: [],
  push_subscriptions: [],
  favorites: [],
  custom_lists: [],
  calendar_events: [],
  bills: [],
  bill_payments: [],
  documents: [],
  fuel_logs: [],
};

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(DEFAULT_DB));
    }
    const content = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return { ...DEFAULT_DB, ...parsed };
  } catch (err) {
    console.error('LocalDb read error:', err);
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function writeDb(data) {
  try {
    const tempFile = `${DB_FILE}.tmp_${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    try {
      if (fs.existsSync(DB_FILE)) {
        fs.unlinkSync(DB_FILE);
      }
    } catch {}
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('LocalDb atomic write error, falling back to direct write:', err);
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('LocalDb direct write error:', e);
    }
  }
}

function compareValues(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

class LocalQuery {
  constructor(table) {
    this.table = table;
    this.action = 'select';
    this.payload = null;
    this.options = null;
    this.filters = [];
    this.orders = [];
    this.limitCount = null;
    this.selectedFields = '*';
    this.isSingle = false;
    this.isMaybeSingle = false;
  }

  select(fields = '*') {
    if (this.action === 'select') {
      this.selectedFields = fields;
    }
    return this;
  }

  insert(data) {
    this.action = 'insert';
    this.payload = data;
    return this;
  }

  update(data) {
    this.action = 'update';
    this.payload = data;
    return this;
  }

  upsert(data, options = {}) {
    this.action = 'upsert';
    this.payload = data;
    this.options = options;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(field, val) {
    this.filters.push((row) => {
      const v = row[field];
      if (val === null || val === undefined) return v === null || v === undefined;
      return String(v) === String(val);
    });
    return this;
  }

  neq(field, val) {
    this.filters.push((row) => {
      const v = row[field];
      if (val === null || val === undefined) return v !== null && v !== undefined;
      return String(v) !== String(val);
    });
    return this;
  }

  gt(field, val) {
    this.filters.push((row) => {
      const v = row[field];
      if (v === null || v === undefined) return false;
      return compareValues(v, val) > 0;
    });
    return this;
  }

  gte(field, val) {
    this.filters.push((row) => {
      const v = row[field];
      if (v === null || v === undefined) return false;
      return compareValues(v, val) >= 0;
    });
    return this;
  }

  lt(field, val) {
    this.filters.push((row) => {
      const v = row[field];
      if (v === null || v === undefined) return false;
      return compareValues(v, val) < 0;
    });
    return this;
  }

  lte(field, val) {
    this.filters.push((row) => {
      const v = row[field];
      if (v === null || v === undefined) return false;
      return compareValues(v, val) <= 0;
    });
    return this;
  }

  is(field, val) {
    this.filters.push((row) => {
      const v = row[field];
      if (val === null) return v === null || v === undefined;
      return v === val;
    });
    return this;
  }

  not(field, op, val) {
    if (op === 'is' && val === null) {
      this.filters.push((row) => row[field] !== null && row[field] !== undefined);
    } else if (op === 'eq') {
      this.filters.push((row) => String(row[field]) !== String(val));
    } else {
      this.filters.push((row) => row[field] !== val);
    }
    return this;
  }

  in(field, arr) {
    const set = new Set((arr || []).map((x) => String(x)));
    this.filters.push((row) => set.has(String(row[field])));
    return this;
  }

  order(field, { ascending = true } = {}) {
    this.orders.push({ field, ascending });
    return this;
  }

  limit(n) {
    this.limitCount = n;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  _project(row) {
    if (!row) return null;
    if (this.selectedFields === '*') return { ...row };
    const fields = this.selectedFields.split(',').map((f) => f.trim()).filter(Boolean);
    const res = {};
    for (const f of fields) {
      res[f] = row[f];
    }
    return res;
  }

  execute() {
    const db = readDb();
    if (!db[this.table]) {
      db[this.table] = [];
    }
    let tableRows = db[this.table];

    // 1. INSERT
    if (this.action === 'insert') {
      const isArray = Array.isArray(this.payload);
      const items = isArray ? this.payload : [this.payload];
      const inserted = [];

      for (const item of items) {
        const row = {
          ...item,
          id: item.id || crypto.randomUUID(),
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.updated_at || new Date().toISOString(),
        };
        tableRows.push(row);
        inserted.push(this._project(row));
      }

      writeDb(db);
      const resultData = this.isSingle ? inserted[0] : (isArray ? inserted : inserted[0]);
      return { data: resultData, error: null };
    }

    // 2. UPSERT
    if (this.action === 'upsert') {
      const isArray = Array.isArray(this.payload);
      const items = isArray ? this.payload : [this.payload];
      const conflictKeys = this.options?.onConflict
        ? this.options.onConflict.split(',').map((k) => k.trim())
        : ['id'];

      const upserted = [];

      for (const item of items) {
        const existingIndex = tableRows.findIndex((row) => {
          return conflictKeys.every((k) => String(row[k] ?? '') === String(item[k] ?? ''));
        });

        if (existingIndex >= 0) {
          tableRows[existingIndex] = {
            ...tableRows[existingIndex],
            ...item,
            updated_at: item.updated_at || new Date().toISOString(),
          };
          upserted.push(this._project(tableRows[existingIndex]));
        } else {
          const row = {
            ...item,
            id: item.id || crypto.randomUUID(),
            created_at: item.created_at || new Date().toISOString(),
            updated_at: item.updated_at || new Date().toISOString(),
          };
          tableRows.push(row);
          upserted.push(this._project(row));
        }
      }

      writeDb(db);
      const resultData = this.isSingle ? upserted[0] : (isArray ? upserted : upserted[0]);
      return { data: resultData, error: null };
    }

    // 3. UPDATE
    if (this.action === 'update') {
      const updated = [];
      tableRows = tableRows.map((row) => {
        const matches = this.filters.every((f) => f(row));
        if (matches) {
          const newRow = {
            ...row,
            ...this.payload,
            updated_at: this.payload?.updated_at || new Date().toISOString(),
          };
          updated.push(this._project(newRow));
          return newRow;
        }
        return row;
      });
      db[this.table] = tableRows;
      writeDb(db);
      return { data: this.isSingle ? updated[0] || null : updated, error: null };
    }

    // 4. DELETE
    if (this.action === 'delete') {
      const remaining = [];
      const deleted = [];
      for (const row of tableRows) {
        const matches = this.filters.every((f) => f(row));
        if (matches) {
          deleted.push(this._project(row));
        } else {
          remaining.push(row);
        }
      }
      db[this.table] = remaining;
      writeDb(db);
      return { data: deleted, error: null };
    }

    // 5. SELECT
    let result = tableRows.filter((row) => this.filters.every((f) => f(row)));

    if (this.orders.length > 0) {
      result.sort((a, b) => {
        for (const ord of this.orders) {
          const cmp = compareValues(a[ord.field], b[ord.field]);
          if (cmp !== 0) return ord.ascending ? cmp : -cmp;
        }
        return 0;
      });
    }

    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount);
    }

    result = result.map((r) => this._project(r));

    if (this.isSingle) {
      if (result.length === 0) {
        return { data: null, error: { message: 'Row not found' } };
      }
      return { data: result[0], error: null };
    }

    if (this.isMaybeSingle) {
      return { data: result[0] || null, error: null };
    }

    return { data: result, error: null };
  }

  then(resolve, reject) {
    try {
      const res = this.execute();
      resolve(res);
    } catch (err) {
      console.error('LocalQuery execution error:', err);
      resolve({ data: null, error: { message: err?.message || String(err) } });
    }
  }
}

export const localAdminClient = {
  from(tableName) {
    return new LocalQuery(tableName);
  },
  storage: {
    from(bucket) {
      const bucketDir = path.join(UPLOAD_DIR, bucket);
      if (!fs.existsSync(bucketDir)) {
        try {
          fs.mkdirSync(bucketDir, { recursive: true });
        } catch {}
      }
      return {
        async upload(objectPath, buffer) {
          try {
            const targetPath = path.join(bucketDir, objectPath);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.writeFileSync(targetPath, Buffer.from(buffer));
            return { data: { path: objectPath }, error: null };
          } catch (err) {
            return { data: null, error: { message: err.message } };
          }
        },
        async download(objectPath) {
          try {
            const targetPath = path.join(bucketDir, objectPath);
            if (!fs.existsSync(targetPath)) {
              return { data: null, error: { message: 'Dosya bulunamadı' } };
            }
            const buf = fs.readFileSync(targetPath);
            return {
              data: {
                async arrayBuffer() {
                  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
                },
              },
              error: null,
            };
          } catch (err) {
            return { data: null, error: { message: err.message } };
          }
        },
        async remove(paths) {
          try {
            for (const p of paths) {
              const targetPath = path.join(bucketDir, p);
              if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath);
              }
            }
            return { data: true, error: null };
          } catch (err) {
            return { data: null, error: { message: err.message } };
          }
        },
      };
    },
  },
};
