'use client';

import { useEffect, useState } from 'react';
import { Box, useDisclosure, Text } from '@chakra-ui/react';
import SimpleAppShell from '@/components/SimpleAppShell';
import { Insight } from '@/components/insights/InsightCard';
import { InsightsOverview } from '@/components/insights/InsightsOverview';
import { InsightDomainFilter, FilterState } from '@/components/insights/InsightDomainFilter';
import { InsightsList } from '@/components/insights/InsightsList';
import { InsightDetails } from '@/components/insights/InsightDetails';

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    domains: [],
    types: [],
    urgencyLevels: [],
    statuses: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      console.log('🔄 Client: Fetching insights from API...');
      const response = await fetch('/api/insights');
      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }
      const data = await response.json();
      console.log('✅ Client: Received insights data:', data.length, 'insights');
      setInsights(data);
    } catch (err) {
      console.log('❌ Client: Failed to fetch insights:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const filteredInsights = insights.filter((ins) => {
    // Domain filter
    if (filters.domains.length > 0 && !filters.domains.includes(ins.module)) {
      return false;
    }
    
    // Type filter
    if (filters.types.length > 0 && !filters.types.includes(ins.insight_type)) {
      return false;
    }
    
    // Urgency filter
    if (filters.urgencyLevels.length > 0 && !filters.urgencyLevels.includes(ins.urgency)) {
      return false;
    }
    
    // Status filter
    if (filters.statuses.length > 0 && !filters.statuses.includes(ins.status)) {
      return false;
    }
    
    return true;
  });

  const stats = {
    totalInsights: insights.length,
    newInsights: insights.filter((i) => i.status === 'new').length,
    urgentInsights: insights.filter((i) => i.urgency === 'גבוהה').length,
    avgConfidence:
      insights.reduce((sum, i) => sum + i.confidence_level, 0) / (insights.length || 1),
    byModule: insights.reduce((acc: Record<string, number>, i) => {
      acc[i.module] = (acc[i.module] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    byType: insights.reduce((acc: Record<string, number>, i) => {
      acc[i.insight_type] = (acc[i.insight_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  const handleAction = (id: number, action: string) => {
    fetch(`/api/insights/${id}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action_type: action,
        action_details: `User clicked ${action}`,
        user_id: 'current_user', // TODO: get from session
      }),
    })
    .then(response => response.json())
    .then(data => {
      console.log('Action recorded:', data);
      // Optionally refresh insights
      fetchInsights();
    })
    .catch(error => {
      console.error('Error recording action:', error);
    });
  };

  const handleViewDetails = (id: number) => {
    const insight = insights.find(i => i.id === id);
    if (insight) {
      setSelectedInsight(insight);
      onOpen();
      // Record view action
      handleAction(id, 'viewed');
    }
  };

  const handleSubmitFeedback = (insightId: number, feedback: any) => {
    fetch(`/api/insights/${insightId}/feedback`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(feedback),
    })
    .then(response => response.json())
    .then(data => {
      console.log('Feedback submitted:', data);
      // Optionally refresh insights
      fetchInsights();
    })
    .catch(error => {
      console.error('Error submitting feedback:', error);
    });
  };

  if (loading) {
    return (
      <SimpleAppShell>
        <Box maxW="7xl" mx="auto" textAlign="center" py={10}>
          <Text>טוען תובנות...</Text>
        </Box>
      </SimpleAppShell>
    );
  }

  if (error) {
    return (
      <SimpleAppShell>
        <Box maxW="7xl" mx="auto" textAlign="center" py={10}>
          <Text color="red.500">שגיאה: {error}</Text>
        </Box>
      </SimpleAppShell>
    );
  }

  return (
    <SimpleAppShell>
      <Box maxW="7xl" mx="auto">
        <InsightsOverview {...stats} />
        <InsightDomainFilter
          insights={insights}
          onFilterChange={setFilters}
        />
        <InsightsList insights={filteredInsights} onAction={handleAction} onViewDetails={handleViewDetails} />
        <InsightDetails
          insight={selectedInsight}
          isOpen={isOpen}
          onClose={onClose}
          onSubmitFeedback={handleSubmitFeedback}
        />
      </Box>
    </SimpleAppShell>
  );
} 