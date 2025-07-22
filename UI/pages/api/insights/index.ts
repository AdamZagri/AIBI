import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { 
      module, 
      type, 
      urgency, 
      status, 
      page = 1, 
      limit = 50,
      minConfidence,
      fromDate,
      toDate
    } = req.query;

    // Build query parameters for your server
    const params = new URLSearchParams();
    if (module) params.append('module', module as string);
    if (type) params.append('type', type as string);
    if (urgency) params.append('urgency', urgency as string);
    if (status) params.append('status', status as string);
    if (minConfidence) params.append('minConfidence', minConfidence as string);
    if (fromDate) params.append('fromDate', fromDate as string);
    if (toDate) params.append('toDate', toDate as string);
    params.append('page', page as string);
    params.append('limit', limit as string);

    // Try to call your server first
    try {
      const SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://aibi.cloudline.co.il';
      const response = await fetch(`${SERVER_BASE_URL}/api/insights?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const serverResponse = await response.json();
        
        // Extract the data array from the server response
        const insights = serverResponse.data || serverResponse;
        console.log('✅ Server returned', insights?.length || 0, 'insights');
        
        // Return the insights array directly
        return res.status(200).json(insights);
      } else {
        console.log('❌ Server returned error status:', response.status);
      }
    } catch (serverError) {
      console.log('❌ Server call failed:', serverError);
      console.log('🔄 Falling back to mock data');
    }

    // Fallback to mock data (temporary)
    const mockInsights = [
      {
        id: 1,
        title: 'עלייה חדה במכירות מוצר X',
        description: 'נרשמה עלייה של 35% במכירות מוצר X השבוע לעומת השבוע הקודם.',
        module: 'מכירות',
        insight_type: 'מגמה',
        urgency: 'נמוכה',
        confidence_level: 85,
        financial_impact: 120000,
        status: 'new',
        created_at: new Date().toISOString(),
        supporting_data: JSON.stringify({
          sales_increase: 35,
          product: 'X',
          period: 'week',
          previous_week: 850000,
          current_week: 1147500
        }),
        recommendation: 'מומלץ להגדיל את המלאי ולהכין קמפיין שיווקי נוסף.',
        source_question: 'מה השינוי במכירות השבוע?',
        sql_query: 'SELECT product, SUM(sales) FROM sales_data WHERE date >= CURRENT_DATE - INTERVAL 7 DAY GROUP BY product',
        execution_time_ms: 245,
        followup_questions: JSON.stringify([
          'איך המלאי של מוצר X?',
          'מה הקמפיינים הפעילים?',
          'איך הביצועים לעומת אשתקד?'
        ]),
        affected_entities: JSON.stringify(['מוצר X', 'מחלקת מכירות', 'מחלקת שיווק']),
        kpi_metrics: JSON.stringify({
          revenue_growth: 35,
          units_sold: 1250,
          conversion_rate: 12.5
        }),
        visualization_type: 'line_chart',
        novelty_score: 8
      },
      {
        id: 2,
        title: 'חריגה בעלויות רכש',
        description: 'עלייה של 12% בעלויות רכש עבור ספק Y לעומת החודש הקודם.',
        module: 'רכש',
        insight_type: 'חריגה',
        urgency: 'גבוהה',
        confidence_level: 92,
        financial_impact: 50000,
        status: 'new',
        created_at: new Date().toISOString(),
        supporting_data: JSON.stringify({
          cost_increase: 12,
          supplier: 'Y',
          period: 'month',
          previous_month: 420000,
          current_month: 470400
        }),
        recommendation: 'יש לבדוק עם הספק את הסיבה לעלייה ולשקול חלופות.',
        source_question: 'מה השינוי בעלויות הרכש החודש?',
        sql_query: 'SELECT supplier, SUM(cost) FROM procurement WHERE month = CURRENT_MONTH GROUP BY supplier',
        execution_time_ms: 180,
        followup_questions: JSON.stringify([
          'מה הספקים החלופיים?',
          'איך המחירים בשוק?',
          'מה ההסכמים הקיימים?'
        ]),
        affected_entities: JSON.stringify(['ספק Y', 'מחלקת רכש', 'מחלקת כספים']),
        kpi_metrics: JSON.stringify({
          cost_variance: 12,
          supplier_performance: 85,
          budget_impact: 50000
        }),
        visualization_type: 'bar_chart',
        novelty_score: 9
      },
      {
        id: 3,
        title: 'הזדמנות לחיסכון בעלויות שילוח',
        description: 'זוהתה הזדמנות לחיסכון של 8% בעלויות שילוח על ידי שינוי ספק.',
        module: 'תפעול',
        insight_type: 'הזדמנות',
        urgency: 'בינונית',
        confidence_level: 78,
        financial_impact: 35000,
        status: 'new',
        created_at: new Date().toISOString(),
        supporting_data: JSON.stringify({
          potential_savings: 8,
          category: 'shipping',
          current_cost: 437500,
          projected_cost: 402500
        }),
        recommendation: 'מומלץ לבדוק את ספק השילוח החלופי ולבצע מבחן פיילוט.',
        source_question: 'איך ניתן לחסוך בעלויות שילוח?',
        sql_query: 'SELECT shipping_provider, AVG(cost) FROM shipping_data GROUP BY shipping_provider',
        execution_time_ms: 320,
        followup_questions: JSON.stringify([
          'מה איכות השירות של הספק החלופי?',
          'איך זמני המשלוח?',
          'מה הביטוח והאחריות?'
        ]),
        affected_entities: JSON.stringify(['ספק שילוח נוכחי', 'ספק חלופי', 'מחלקת תפעול']),
        kpi_metrics: JSON.stringify({
          cost_reduction: 8,
          delivery_time: 2.5,
          customer_satisfaction: 94
        }),
        visualization_type: 'pie_chart',
        novelty_score: 6
      },
    ];

    let filteredInsights = mockInsights;

    // Apply filters
    if (module) {
      filteredInsights = filteredInsights.filter(i => i.module === module);
    }
    if (type) {
      filteredInsights = filteredInsights.filter(i => i.insight_type === type);
    }
    if (urgency) {
      filteredInsights = filteredInsights.filter(i => i.urgency === urgency);
    }
    if (status) {
      filteredInsights = filteredInsights.filter(i => i.status === status);
    }
    if (minConfidence) {
      filteredInsights = filteredInsights.filter(i => i.confidence_level >= parseInt(minConfidence as string));
    }

    // Apply pagination
    const startIndex = (parseInt(page as string) - 1) * parseInt(limit as string);
    const endIndex = startIndex + parseInt(limit as string);
    const paginatedInsights = filteredInsights.slice(startIndex, endIndex);

    res.status(200).json(paginatedInsights);
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
} 