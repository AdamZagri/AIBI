# מדריך שימוש ב-Insights API

## 🚀 **API Endpoints מוכנים לשימוש**

### 📋 **קבלת תובנות**
```javascript
// GET /api/insights - קבלת רשימת תובנות
const response = await fetch('/api/insights?module=מכירות&urgency=גבוהה&limit=10');
const data = await response.json();

// פרמטרים אופציונליים:
// - module: מכירות, כספים, רכש, תפעול, משולב
// - insight_type: חריגה, מגמה, קורלציה, הזדמנות, סיכון, דפוס, השוואה
// - urgency: גבוהה, בינונית, נמוכה
// - limit: מספר תוצאות (ברירת מחדל: 50)
// - offset: דילוג על תוצאות (ברירת מחדל: 0)
// - sort_by: עמודה למיון (ברירת מחדל: created_at)
// - sort_order: ASC או DESC (ברירת מחדל: DESC)
```

### 🔍 **קבלת תובנה יחידה**
```javascript
// GET /api/insights/:id - קבלת תובנה מפורטת
const response = await fetch('/api/insights/123');
const data = await response.json();

// התשובה כוללת:
// - insight: פרטי התובנה
// - actions: פעולות קשורות
// - learning: פידבק שנאסף
```

### ✅ **הוספת פעולה לתובנה**
```javascript
// POST /api/insights/:id/actions - הוספת פעולה
const response = await fetch('/api/insights/123/actions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action_type: 'בדיקה',
    action_description: 'בדיקת נתונים נוספים',
    assigned_to: 'john@company.com',
    due_date: '2025-08-01',
    priority: 'גבוהה'
  })
});
```

### 🔄 **עדכון סטטוס פעולה**
```javascript
// PUT /api/insights/actions/:actionId/status - עדכון סטטוס
const response = await fetch('/api/insights/actions/456/status', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'הושלם',
    notes: 'הבדיקה הושלמה בהצלחה'
  })
});

// סטטוסים אפשריים: ממתין, בביצוע, הושלם, בוטל
```

### 💬 **הוספת פידבק לתובנה**
```javascript
// POST /api/insights/:id/feedback - הוספת פידבק
const response = await fetch('/api/insights/123/feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    feedback_type: 'accuracy',
    feedback_value: 5,
    user_notes: 'תובנה מדויקת ושימושית',
    user_id: 'user123'
  })
});

// סוגי פידבק:
// - accuracy: דיוק (1-5)
// - usefulness: שימושיות (1-5)
// - clarity: בהירות (1-5)
// - actionability: ניתנות לפעולה (1-5)
```

### 📊 **סטטיסטיקות תובנות**
```javascript
// GET /api/insights/stats - קבלת סטטיסטיקות
const response = await fetch('/api/insights/stats');
const data = await response.json();

// התשובה כוללת:
// - overview: סיכום כללי
// - distribution: התפלגות לפי תחום/סוג/דחיפות
// - actions: סטטיסטיקות פעולות
// - recent_insights: תובנות אחרונות
```

### 🔎 **חיפוש תובנות**
```javascript
// GET /api/insights/search - חיפוש טקסט חופשי
const response = await fetch('/api/insights/search?q=מכירות&module=מכירות&limit=10');
const data = await response.json();
```

## 🎨 **דוגמאות שימוש ב-React**

### רכיב רשימת תובנות
```jsx
import React, { useState, useEffect } from 'react';

const InsightsList = () => {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    module: '',
    urgency: '',
    limit: 20
  });

  useEffect(() => {
    fetchInsights();
  }, [filters]);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      
      const response = await fetch(`/api/insights?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setInsights(data.data);
      }
    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAction = async (insightId, actionData) => {
    try {
      const response = await fetch(`/api/insights/${insightId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionData)
      });
      
      const result = await response.json();
      if (result.success) {
        // רענון התובנה
        fetchInsights();
      }
    } catch (error) {
      console.error('Error adding action:', error);
    }
  };

  const handleFeedback = async (insightId, feedbackData) => {
    try {
      const response = await fetch(`/api/insights/${insightId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackData)
      });
      
      const result = await response.json();
      if (result.success) {
        console.log('Feedback submitted successfully');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  return (
    <div className="insights-container">
      {/* סינונים */}
      <div className="filters">
        <select 
          value={filters.module} 
          onChange={(e) => setFilters({...filters, module: e.target.value})}
        >
          <option value="">כל התחומים</option>
          <option value="מכירות">מכירות</option>
          <option value="כספים">כספים</option>
          <option value="רכש">רכש</option>
          <option value="תפעול">תפעול</option>
          <option value="משולב">משולב</option>
        </select>
        
        <select 
          value={filters.urgency} 
          onChange={(e) => setFilters({...filters, urgency: e.target.value})}
        >
          <option value="">כל הדחיפויות</option>
          <option value="גבוהה">גבוהה</option>
          <option value="בינונית">בינונית</option>
          <option value="נמוכה">נמוכה</option>
        </select>
      </div>

      {/* רשימת תובנות */}
      {loading ? (
        <div>טוען...</div>
      ) : (
        <div className="insights-grid">
          {insights.map(insight => (
            <InsightCard 
              key={insight.id}
              insight={insight}
              onAddAction={handleAddAction}
              onFeedback={handleFeedback}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default InsightsList;
```

### רכיב כרטיס תובנה
```jsx
const InsightCard = ({ insight, onAddAction, onFeedback }) => {
  const [showActions, setShowActions] = useState(false);
  const [actionForm, setActionForm] = useState({
    action_type: '',
    action_description: '',
    assigned_to: '',
    due_date: ''
  });

  const getUrgencyColor = (urgency) => {
    switch(urgency) {
      case 'גבוהה': return 'bg-red-100 border-red-500';
      case 'בינונית': return 'bg-yellow-100 border-yellow-500';
      case 'נמוכה': return 'bg-green-100 border-green-500';
      default: return 'bg-gray-100 border-gray-500';
    }
  };

  const handleSubmitAction = async (e) => {
    e.preventDefault();
    await onAddAction(insight.id, actionForm);
    setActionForm({ action_type: '', action_description: '', assigned_to: '', due_date: '' });
    setShowActions(false);
  };

  return (
    <div className={`insight-card border-l-4 p-4 rounded-lg ${getUrgencyColor(insight.urgency)}`}>
      {/* כותרת */}
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-semibold">{insight.title}</h3>
        <div className="flex gap-2">
          <span className="badge badge-module">{insight.module}</span>
          <span className="badge badge-type">{insight.insight_type}</span>
        </div>
      </div>

      {/* תיאור */}
      <p className="text-gray-700 mb-3">{insight.description}</p>

      {/* המלצה */}
      {insight.recommendation && (
        <div className="recommendation bg-blue-50 p-3 rounded mb-3">
          <strong>המלצה:</strong> {insight.recommendation}
        </div>
      )}

      {/* מדדים */}
      <div className="metrics flex gap-4 mb-3 text-sm">
        <span>דחיפות: <strong>{insight.urgency}</strong></span>
        <span>ביטחון: <strong>{insight.confidence_level}%</strong></span>
        {insight.financial_impact && (
          <span>השפעה כספית: <strong>₪{insight.financial_impact.toLocaleString()}</strong></span>
        )}
      </div>

      {/* כפתורי פעולה */}
      <div className="actions flex gap-2">
        <button 
          onClick={() => setShowActions(!showActions)}
          className="btn btn-primary"
        >
          הוסף פעולה
        </button>
        
        <button 
          onClick={() => onFeedback(insight.id, {
            feedback_type: 'usefulness',
            feedback_value: 5,
            user_notes: 'שימושי'
          })}
          className="btn btn-secondary"
        >
          👍 שימושי
        </button>
      </div>

      {/* טופס הוספת פעולה */}
      {showActions && (
        <form onSubmit={handleSubmitAction} className="action-form mt-4 p-4 bg-gray-50 rounded">
          <div className="grid grid-cols-2 gap-4">
            <select 
              value={actionForm.action_type}
              onChange={(e) => setActionForm({...actionForm, action_type: e.target.value})}
              required
            >
              <option value="">סוג פעולה</option>
              <option value="בדיקה">בדיקה</option>
              <option value="יישום">יישום</option>
              <option value="מעקב">מעקב</option>
              <option value="דיווח">דיווח</option>
            </select>
            
            <input
              type="email"
              placeholder="אחראי"
              value={actionForm.assigned_to}
              onChange={(e) => setActionForm({...actionForm, assigned_to: e.target.value})}
            />
            
            <textarea
              placeholder="תיאור הפעולה"
              value={actionForm.action_description}
              onChange={(e) => setActionForm({...actionForm, action_description: e.target.value})}
              required
              className="col-span-2"
            />
            
            <input
              type="date"
              value={actionForm.due_date}
              onChange={(e) => setActionForm({...actionForm, due_date: e.target.value})}
            />
          </div>
          
          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn btn-primary">שמור פעולה</button>
            <button type="button" onClick={() => setShowActions(false)} className="btn btn-secondary">ביטול</button>
          </div>
        </form>
      )}
    </div>
  );
};
```

## 📱 **עיצוב CSS מומלץ**

```css
.insights-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.filters {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.insights-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 20px;
}

.insight-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  transition: transform 0.2s;
}

.insight-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

.badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.badge-module {
  background: #e3f2fd;
  color: #1976d2;
}

.badge-type {
  background: #f3e5f5;
  color: #7b1fa2;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn-primary {
  background: #1976d2;
  color: white;
}

.btn-secondary {
  background: #f5f5f5;
  color: #333;
}

.action-form {
  border: 1px solid #e0e0e0;
}

.action-form input,
.action-form select,
.action-form textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}
```

## ✅ **סיכום**

עכשיו יש לך:
1. **7 API endpoints** מוכנים לשימוש
2. **פונקציות JavaScript** לקריאה מה-UI
3. **רכיבי React** מוכנים לשימוש
4. **עיצוב CSS** בסיסי

**הצעד הבא:** העתק את הקוד לפרויקט React/Next.js שלך והתאם לעיצוב הקיים! 