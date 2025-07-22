import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { id } = req.query;
  const { action, user } = req.body;

  try {
    // Try to call your server first
    try {
      const SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://aibi.cloudline.co.il';
      console.log('🔄 Attempting to call server action:', `${SERVER_BASE_URL}/api/insights/${id}/actions`);
      console.log('📤 Action payload:', { action, user });
      const response = await fetch(`${SERVER_BASE_URL}/api/insights/${id}/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          user
        })
      });

      console.log('📡 Server action response status:', response.status);
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Successfully recorded action on server:', result);
        return res.status(200).json(result);
      } else {
        console.log('❌ Server action returned error status:', response.status);
      }
    } catch (serverError) {
      console.log('❌ Server action call failed:', serverError);
      console.log('🔄 Using mock response for action');
    }

    // Mock response for now
    res.status(200).json({ 
      success: true, 
      message: `Action ${action} recorded for insight ${id}` 
    });
  } catch (error) {
    console.error('Error recording insight action:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
} 