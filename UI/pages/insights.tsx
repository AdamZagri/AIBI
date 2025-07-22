// pages/insights.tsx
import { useEffect, useState } from 'react';
import { useSession, getSession } from 'next-auth/react';
import { GetServerSideProps } from 'next';
import { Box, useDisclosure, Text, VStack, HStack, Heading, useColorModeValue, Button, IconButton, Tooltip } from '@chakra-ui/react';
import { FiRefreshCw, FiDownload, FiSettings, FiFilter } from 'react-icons/fi';
import { Insight } from '@/components/insights/InsightCard';
import { InsightsOverview } from '@/components/insights/InsightsOverview';
import { InsightDomainFilter, FilterState } from '@/components/insights/InsightDomainFilter';
import { InsightsList } from '@/components/insights/InsightsList';
import { InsightDetails } from '@/components/insights/InsightDetails';
import { SERVER_BASE_URL } from '@/lib/config';

export default function InsightsPage() {
  const { data: session } = useSession()
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

  // Theme colors
  const textColor = useColorModeValue('gray.800', 'white');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      console.log('🔄 Client: Fetching insights from backend API...');
      const response = await fetch(`${SERVER_BASE_URL}/api/insights`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch insights: ${response.status}`);
      }
      const result = await response.json();
      console.log('✅ Client: Received insights result:', result);
      setInsights(result.data || []);
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
    fetch(`${SERVER_BASE_URL}/api/insights/${id}/actions`, {
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
    fetch(`${SERVER_BASE_URL}/api/insights/${insightId}/feedback`, {
      method: 'POST',
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
      <VStack spacing={6} py={10}>
        <Text>טוען תובנות...</Text>
      </VStack>
    );
  }

  if (error) {
    return (
      <VStack spacing={6} py={10}>
        <Text color="red.500">שגיאה: {error}</Text>
      </VStack>
    );
  }

  return (
    <Box position="relative" h="100vh">
      {/* Fixed Header */}
      <Box 
        position="fixed"
        top={0}
        right={{ base: "0", md: "280px" }}
        width={{ base: "100%", md: "calc(100% - 280px)" }}
        bg={useColorModeValue('white', 'gray.800')} 
        borderBottom="1px"
        borderColor={useColorModeValue('gray.200', 'gray.600')}
        zIndex={1000}
        p={4}
        minH="72px"
        display="flex"
        alignItems="center"
      >
        <HStack justify="space-between" align="center" w="100%">
          <VStack align="start" spacing={0}>
            <Heading size="md" color={textColor} fontWeight="bold">
              תובנות עסקיות
            </Heading>
          </VStack>
          
          <HStack spacing={2}>
            <Tooltip label="רענן תובנות">
              <IconButton
                icon={<FiRefreshCw />}
                variant="outline"
                size="sm"
                aria-label="רענן תובנות"
                onClick={fetchInsights}
                isLoading={loading}
              />
            </Tooltip>
            <Tooltip label="ייצא נתונים">
              <IconButton
                icon={<FiDownload />}
                variant="outline"
                size="sm"
                aria-label="ייצא נתונים"
                onClick={() => {
                  // TODO: Export functionality
                  console.log('Export insights data');
                }}
              />
            </Tooltip>
            <Tooltip label="הגדרות תובנות">
              <IconButton
                icon={<FiSettings />}
                variant="outline"
                size="sm"
                aria-label="הגדרות תובנות"
                onClick={() => {
                  // TODO: Settings functionality
                  console.log('Open insights settings');
                }}
              />
            </Tooltip>
          </HStack>
        </HStack>
      </Box>

      {/* Main Content */}
      <VStack 
        spacing={6} 
        align="stretch"
        pt="84px"  // מקום לכותרת הקבועה
        px={6}
        pb={4}
        h="100vh"
        overflowY="auto"
        sx={{
          scrollbarGutter: 'stable',
          '&::-webkit-scrollbar': { width: '8px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '4px',
          },
        }}
      >
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
      </VStack>
    </Box>
  );
}

// Server-side props for session
export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context)
  
  return {
    props: {
      session,
    },
  }
} 