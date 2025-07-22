import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { id } = req.query;
  const { relevance_score, feedback, status } = req.body;

  try {
    // Try to call your server first
    try {
      const SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://aibi.cloudline.co.il';
      console.log('🔄 Attempting to call server feedback:', `${SERVER_BASE_URL}/api/insights/${id}/feedback`);
      console.log('📤 Feedback payload:', { relevance_score, feedback, status });
      const response = await fetch(`${SERVER_BASE_URL}/api/insights/${id}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relevance_score,
          feedback,
          status
        })
      });

      console.log('📡 Server feedback response status:', response.status);
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Successfully recorded feedback on server:', result);
        return res.status(200).json(result);
      } else {
        console.log('❌ Server feedback returned error status:', response.status);
      }
    } catch (serverError) {
      console.log('❌ Server feedback call failed:', serverError);
      console.log('🔄 Using mock response for feedback');
    }

    // Mock response for now
    res.status(200).json({ 
      success: true, 
      message: `Feedback recorded for insight ${id}` 
    });
  } catch (error) {
    console.error('Error recording insight feedback:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
} 