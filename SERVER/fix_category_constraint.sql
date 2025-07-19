-- תיקון CHECK constraint עבור category בטבלת ai_guidelines
-- הוספת 'insights' כקטגוריה חוקית

-- שלב 1: יצירת טבלה חדשה עם CHECK constraint מעודכן
CREATE TABLE ai_guidelines_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- סיווג בסיסי
    category TEXT NOT NULL CHECK (category IN ('system', 'user', 'examples', 'insights')),
    subcategory TEXT, -- 'business_rules', 'sql_syntax', 'data_structure', 'query_patterns' 
    module_id INTEGER REFERENCES business_modules(id),
    
    -- תוכן
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    
    -- משתמש (רק לקטגוריית user)
    user_email TEXT, -- NULL עבור system guidelines
    
    -- AI Validation
    validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'approved', 'rejected', 'needs_review')),
    ai_feedback TEXT, -- הערות AI על ההנחיה
    ai_improved_version TEXT, -- גרסה משופרת מה-AI
    ai_validation_date TIMESTAMP,
    
    -- מטא-דטה
    priority INTEGER DEFAULT 0, -- עדיפות טעינה (גבוה יותר = קודם)
    active BOOLEAN DEFAULT 0, -- רק לאחר אישור
    tags TEXT, -- JSON array of tags
    
    -- מעקב
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT, -- email של יוצר
    updated_by TEXT, -- email של עדכן אחרון
    source_file TEXT -- קובץ המקור של ההנחיה
);

-- שלב 2: העברת כל הנתונים מהטבלה הישנה לחדשה
INSERT INTO ai_guidelines_new 
SELECT * FROM ai_guidelines;

-- שלב 3: מחיקת הטבלה הישנה
DROP TABLE ai_guidelines;

-- שלב 4: שינוי שם הטבלה החדשה
ALTER TABLE ai_guidelines_new RENAME TO ai_guidelines;

-- שלב 5: יצירת אינדקסים מחדש
CREATE INDEX IF NOT EXISTS idx_guidelines_category ON ai_guidelines(category);
CREATE INDEX IF NOT EXISTS idx_guidelines_module ON ai_guidelines(module_id);
CREATE INDEX IF NOT EXISTS idx_guidelines_user ON ai_guidelines(user_email);
CREATE INDEX IF NOT EXISTS idx_guidelines_status ON ai_guidelines(validation_status);
CREATE INDEX IF NOT EXISTS idx_guidelines_active ON ai_guidelines(active);

-- שלב 6: יצירת טריגר updated_at מחדש
CREATE TRIGGER IF NOT EXISTS update_guidelines_timestamp 
    AFTER UPDATE ON ai_guidelines
    FOR EACH ROW
BEGIN
    UPDATE ai_guidelines SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- שלב 7: עדכון הקטגוריה עבור מודול 5 (תובנות)
UPDATE ai_guidelines
SET category = 'insights'
WHERE module_id = 5;

-- שלב 8: עדכון הנחיות שהיו במודול 5 להוציא אותן ממודול ספציפי
UPDATE ai_guidelines
SET module_id = NULL
WHERE category = 'insights';

-- שלב 9: השבתת מודול 5 (תובנות) כי זה לא מודול אלא קטגוריה
UPDATE business_modules
SET active = 0
WHERE id = 5;

-- אישור השינויים
SELECT 'תיקון הושלם בהצלחה!' as message;
SELECT 'מספר הנחיות בקטגוריה insights:' as message, COUNT(*) as count FROM ai_guidelines WHERE category = 'insights';
SELECT 'מודול 5 הושבת:' as message, active FROM business_modules WHERE id = 5; 