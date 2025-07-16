import { SimpleGrid } from '@chakra-ui/react';
import { InsightCard, Insight } from '@/components/insights/InsightCard';

export interface InsightsListProps {
  insights: Insight[];
  onAction: (id: number, action: string) => void;
  onViewDetails: (id: number) => void;
}

export function InsightsList({ insights, onAction, onViewDetails }: InsightsListProps) {
  return (
    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
      {insights.map((insight) => (
        <InsightCard
          key={insight.id}
          insight={insight}
          onAction={onAction}
          onViewDetails={onViewDetails}
        />
      ))}
    </SimpleGrid>
  );
} 