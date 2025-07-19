-- הגדרת טבלאות למערכת הנחיות דינמית
-- ai_bi_users.sqlite

-- טבלת מודולים עסקיים
CREATE TABLE IF NOT EXISTS business_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_code TEXT UNIQUE NOT NULL,
    module_name_hebrew TEXT NOT NULL,
    module_name_english TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- הכנסת מודולים בסיסיים
INSERT OR IGNORE INTO business_modules (module_code, module_name_hebrew, module_name_english, description, icon) VALUES 
('finance', 'כספים', 'Finance', 'תנועות יומן, חובות, חשבונות', 'money'),
('sales', 'מכירות', 'Sales', 'שורות מכירה, לקוחות, מחירים', 'shopping-cart'),
('inventory', 'מלאי', 'Inventory', 'מוצרים, מחסן, רכש', 'package'),
('production', 'ייצור', 'Production', 'מכונות CTI, הזמנות ייצור, פעולות', 'factory'),
('insights', 'תובנות', 'Insights', 'ניתוח נתונים וחקירה', 'chart'),
('general', 'כללי', 'General', 'הנחיות כלליות למערכת', 'settings');

-- טבלת הנחיות
CREATE TABLE IF NOT EXISTS ai_guidelines (
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
    updated_by TEXT  -- email של עדכן אחרון
);

-- אינדקסים לביצועים
CREATE INDEX IF NOT EXISTS idx_guidelines_category ON ai_guidelines(category);
CREATE INDEX IF NOT EXISTS idx_guidelines_module ON ai_guidelines(module_id);
CREATE INDEX IF NOT EXISTS idx_guidelines_user ON ai_guidelines(user_email);
CREATE INDEX IF NOT EXISTS idx_guidelines_status ON ai_guidelines(validation_status);
CREATE INDEX IF NOT EXISTS idx_guidelines_active ON ai_guidelines(active);

-- טבלת דוגמאות שאילתות (חלק מהexamples או טבלה נפרדת)
CREATE TABLE IF NOT EXISTS ai_guidelines WHERE category = 'examples' (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guideline_id INTEGER REFERENCES ai_guidelines(id),
    module_id INTEGER REFERENCES business_modules(id),
    
    -- השאלה והתשובה
    title TEXT NOT NULL,
    expected_sql TEXT NOT NULL,
    explanation TEXT,
    
    -- מטא-דטה
    difficulty_level TEXT CHECK (difficulty_level IN ('basic', 'intermediate', 'advanced')),
    tags TEXT, -- JSON array
    
    -- סטטוס
    active BOOLEAN DEFAULT 1,
    validated BOOLEAN DEFAULT 0,
    
    -- מעקב
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
);

-- אינדקסים לדוגמאות
CREATE INDEX IF NOT EXISTS idx_examples_guideline ON ai_guidelines WHERE category = 'examples'(guideline_id);
CREATE INDEX IF NOT EXISTS idx_examples_module ON ai_guidelines WHERE category = 'examples'(module_id);
CREATE INDEX IF NOT EXISTS idx_examples_active ON ai_guidelines WHERE category = 'examples'(active);

-- טבלת היסטוריית שינויים (אופציונלי)
CREATE TABLE IF NOT EXISTS guidelines_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guideline_id INTEGER REFERENCES ai_guidelines(id),
    change_type TEXT NOT NULL, -- 'created', 'updated', 'status_changed', 'deleted'
    old_content TEXT,
    new_content TEXT,
    changed_by TEXT,
    change_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- טריגרים לעדכון updated_at
CREATE TRIGGER IF NOT EXISTS update_guidelines_timestamp 
    AFTER UPDATE ON ai_guidelines
    FOR EACH ROW
BEGIN
    UPDATE ai_guidelines SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_examples_timestamp 
    AFTER UPDATE ON ai_guidelines WHERE category = 'examples'
    FOR EACH ROW
BEGIN
    UPDATE ai_guidelines WHERE category = 'examples' SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END; 