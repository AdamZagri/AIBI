import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Try to call your server first
    try {
      console.log('🔄 Attempting to call server stats:', 'https://aibi.cloudline.co.il/api/insights/stats');
      const response = await fetch('https://aibi.cloudline.co.il/api/insights/stats', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('📡 Server stats response status:', response.status);
      if (response.ok) {
        const stats = await response.json();
        console.log('✅ Successfully received stats from server:', stats);
        return res.status(200).json(stats);
      } else {
        console.log('❌ Server stats returned error status:', response.status);
      }
    } catch (serverError) {
      console.log('❌ Server stats call failed:', serverError);
      console.log('🔄 Falling back to mock stats');
    }

    // Fallback to mock stats (temporary)
    const stats = {
      total_insights: 3,
      new_insights: 3,
      urgent_insights: 1,
      avg_confidence: 85,
      by_module: {
        'מכירות': 1,
        'רכש': 1,
        'תפעול': 1,
      },
      by_type: {
        'מגמה': 1,
        'חריגה': 1,
        'הזדמנות': 1,
      },
      last_7_days: [
        { date: '2024-01-14', count: 1 },
        { date: '2024-01-15', count: 2 },
      ]
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error('Error fetching insights stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
} 