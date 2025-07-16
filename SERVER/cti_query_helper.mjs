import duckdb from 'duckdb';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// פונקציה לחיבור לבסיס נתוני CTI
export function connectToCTI() {
  const dbPath = join(__dirname, 'cti_manufacturing.duckdb');
  
  if (!fs.existsSync(dbPath)) {
    throw new Error(`CTI database not found at ${dbPath}. Please run: node load_cti_data.mjs`);
  }
  
  return new duckdb.Database(dbPath);
}

// פונקציה לשאילתת CTI
export async function queryCTI(sql) {
  const db = connectToCTI();
  
  return new Promise((resolve, reject) => {
    db.all(sql, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
      db.close(); // סגירת החיבור אחרי השאילתה
    });
  });
}

// פונקציה לבדיקת זמינות נתוני CTI
export async function checkCTIAvailability() {
  let db;
  try {
    db = connectToCTI();
    
    const tables = await new Promise((resolve, reject) => {
      db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main';", (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    const ctiTables = tables.filter(t => t.table_name.startsWith('CTI_') || t.table_name.startsWith('CIT_'));
    
    return {
      available: ctiTables.length > 0,
      tables: ctiTables.map(t => t.table_name),
      count: ctiTables.length
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
      tables: [],
      count: 0
    };
  } finally {
    if (db) db.close();
  }
}

// פונקציה לקבלת סטטיסטיקות CTI
export async function getCTIStats() {
  let db;
  try {
    db = connectToCTI();
    const stats = {};
    
    const tables = [
      { name: 'CTI_Machine', description: 'מכונות' },
      { name: 'CTI_orders', description: 'הזמנות' },
      { name: 'CTI_Operation', description: 'פעולות' },
      { name: 'CIT_Operation_info', description: 'מידע פעולות' },
      { name: 'CTI_Customer', description: 'לקוחות' },
      { name: 'CTI_Areashft', description: 'משמרות' }
    ];
    
    for (const table of tables) {
      try {
        const result = await new Promise((resolve, reject) => {
          db.all(`SELECT COUNT(*) as count FROM ${table.name};`, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
        
        stats[table.name] = {
          count: result[0].count,
          description: table.description
        };
      } catch (error) {
        stats[table.name] = {
          count: 0,
          description: table.description,
          error: error.message
        };
      }
    }
    
    return stats;
  } catch (error) {
    throw new Error(`Failed to get CTI stats: ${error.message}`);
  } finally {
    if (db) db.close();
  }
} 