import duckdb from 'duckdb';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// פונקציה לטעינת נתוני CTI ל-DuckDB
async function loadCTIData(forceReload = false) {
  const dbPath = join(__dirname, 'feature_store_heb.duckdb');
  const db = new duckdb.Database(dbPath);
  
  console.log('🚀 מתחיל טעינת נתוני CTI ל-feature_store_heb...');
  if (forceReload) {
    console.log('🔄 מצב טעינה מחדש - מחק טבלאות קיימות...');
  }
  
  const ctiFiles = [
    {
      name: 'cti_machines',
      file: 'cti_data/CTI_Machine.csv',
      description: 'מכונות ייצור'
    },
    {
      name: 'cti_orders',
      file: 'cti_data/CTI_orders.csv',
      description: 'הזמנות ייצור'
    },
    {
      name: 'cti_operations',
      file: 'cti_data/CTI_Operation.csv',
      description: 'פעולות ייצור'
    },
    {
      name: 'cti_operation_info',
      file: 'cti_data/CIT_Operation_info.csv',
      description: 'מידע מפורט על פעולות'
    },
    {
      name: 'cti_customers',
      file: 'cti_data/CTI_Customer.csv',
      description: 'לקוחות'
    },
    {
      name: 'cti_areashft',
      file: 'cti_data/CTI_Areashft.csv',
      description: 'משמרות ואזורים'
    }
  ];

  for (const table of ctiFiles) {
    try {
      const filePath = join(__dirname, table.file);
      
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️ קובץ לא נמצא: ${table.file}`);
        continue;
      }

      // בדיקה אם הטבלה כבר קיימת
      const checkTableQuery = `
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_name = '${table.name}';
      `;
      
      const tableExists = await new Promise((resolve, reject) => {
        db.all(checkTableQuery, (err, result) => {
          if (err) reject(err);
          else resolve(result[0].count > 0);
        });
      });
      
      if (tableExists && !forceReload) {
        console.log(`⏭️ ${table.description} כבר קיימת - מדלג...`);
        continue;
      }
      
      if (tableExists && forceReload) {
        console.log(`🗑️ מוחק טבלה קיימת: ${table.description}...`);
        await new Promise((resolve, reject) => {
          db.all(`DROP TABLE IF EXISTS ${table.name};`, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      }

      console.log(`📥 טוען ${table.description} מ-${table.file}...`);
      
      // יצירת טבלה מה-CSV
      const createTableQuery = `
        CREATE TABLE ${table.name} AS 
        SELECT * FROM read_csv_auto('${filePath}', 
          header=true, 
          ignore_errors=true,
          sample_size=10000
        );
      `;
      
      await new Promise((resolve, reject) => {
        db.all(createTableQuery, (err, result) => {
          if (err) {
            console.error(`❌ שגיאה בטעינת ${table.name}:`, err.message);
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
      
      // בדיקת מספר השורות
      const countQuery = `SELECT COUNT(*) as count FROM ${table.name};`;
      const countResult = await new Promise((resolve, reject) => {
        db.all(countQuery, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      console.log(`✅ ${table.description}: ${countResult[0].count} שורות נטענו`);
      
    } catch (error) {
      console.error(`❌ שגיאה בטעינת ${table.name}:`, error.message);
    }
  }
  
  // יצירת אינדקסים לביצועים טובים יותר
  console.log('📊 יוצר אינדקסים...');
  
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_cti_machine_id ON cti_machines(MachineID);',
    'CREATE INDEX IF NOT EXISTS idx_cti_order_link ON cti_orders(OrderLink);',
    'CREATE INDEX IF NOT EXISTS idx_cti_customer_link ON cti_orders(CustomerLink);',
    'CREATE INDEX IF NOT EXISTS idx_cti_operation_order ON cti_operations(OrderLink);',
    'CREATE INDEX IF NOT EXISTS idx_cti_operation_machine ON cti_operations(OPMachineLink);',
    'CREATE INDEX IF NOT EXISTS idx_cti_customer_link_cust ON cti_customers(CustomerLink);',
    'CREATE INDEX IF NOT EXISTS idx_cti_operation_info_order ON cti_operation_info(OrderLink);'
  ];
  
  for (const indexQuery of indexes) {
    try {
      await new Promise((resolve, reject) => {
        db.all(indexQuery, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    } catch (error) {
      console.log(`⚠️ שגיאה ביצירת אינדקס: ${error.message}`);
    }
  }
  
  // הצגת סיכום
  console.log('\n📋 סיכום הטעינה:');
  console.log('================');
  
  for (const table of ctiFiles) {
    try {
      const countQuery = `SELECT COUNT(*) as count FROM ${table.name};`;
      const countResult = await new Promise((resolve, reject) => {
        db.all(countQuery, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      console.log(`${table.description}: ${countResult[0].count.toLocaleString()} שורות`);
    } catch (error) {
      console.log(`${table.description}: שגיאה בטעינה`);
    }
  }
  
  // דוגמאות שאילתות לבדיקה
  console.log('\n🔍 דוגמאות שאילתות:');
  console.log('==================');
  
  try {
    // מכונות פעילות
    const machinesQuery = `SELECT MachineID, MachineDescription FROM cti_machines LIMIT 5;`;
    const machines = await new Promise((resolve, reject) => {
      db.all(machinesQuery, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    console.log('\nמכונות במערכת:');
    machines.forEach(machine => {
      console.log(`- ${machine.MachineID}: ${machine.MachineDescription || 'ללא תיאור'}`);
    });
    
    // הזמנות אחרונות
    const ordersQuery = `
      SELECT OrderID, CustItemID, DueDateTime 
      FROM cti_orders 
      WHERE DueDateTime IS NOT NULL 
      ORDER BY DueDateTime DESC 
      LIMIT 5;
    `;
    
    const orders = await new Promise((resolve, reject) => {
      db.all(ordersQuery, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    console.log('\nהזמנות אחרונות:');
    orders.forEach(order => {
      console.log(`- הזמנה ${order.OrderID}: ${order.CustItemID || 'ללא תיאור'} (${order.DueDateTime})`);
    });
    
  } catch (error) {
    console.error('שגיאה בדוגמאות:', error.message);
  }
  
  console.log('\n✅ טעינת נתוני CTI ל-feature_store_heb הושלמה בהצלחה!');
  console.log('📖 קרא את IMPORTANT_CTI.txt למידע מפורט על המערכת');
  console.log(`💾 הנתונים נשמרו בקובץ: ${dbPath}`);
  console.log('🔗 הטבלאות נטענו עם prefix "cti_" למניעת התנגשויות');
  
  // סגירת החיבור
  db.close();
  
  return dbPath;
}

// הרצת הסקריפט
if (import.meta.url.endsWith('load_cti_data.mjs')) {
  const args = process.argv.slice(2);
  const forceReload = args.includes('--force') || args.includes('-f');
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📖 שימוש: node load_cti_data.mjs [אופציות]

מטרה: טעינת נתוני CTI אל feature_store_heb.duckdb

אופציות:
  --force, -f     טעינה מחדש (מחיקת טבלאות קיימות)
  --help, -h      הצגת הודעת עזרה זו

דוגמאות:
  node load_cti_data.mjs              # טעינה רגילה (מדלג על טבלאות קיימות)
  node load_cti_data.mjs --force      # טעינה מחדש מלאה
  node load_cti_data.mjs -f           # טעינה מחדש מלאה (קיצור)

הטבלאות נטענות עם prefix "cti_":
  - cti_machines, cti_orders, cti_operations, cti_customers, וכו׳
    `);
    process.exit(0);
  }
  
  loadCTIData(forceReload).catch(console.error);
}

export { loadCTIData }; 