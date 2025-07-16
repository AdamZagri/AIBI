import { Box, SimpleGrid, Select, Button } from '@chakra-ui/react';
import { useState } from 'react';

export interface FilterState {
  module?: string;
  type?: string;
  urgency?: string;
  status?: string;
}

export interface InsightFiltersProps {
  modules: string[];
  types: string[];
  urgencyLevels: string[];
  statuses: string[];
  onFilterChange: (filters: FilterState) => void;
}

export function InsightFilters({
  modules,
  types,
  urgencyLevels,
  statuses,
  onFilterChange,
}: InsightFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({});

  const handleChange = (key: keyof FilterState, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    setFilters({});
    onFilterChange({});
  };

  return (
    <Box bg="white" p={4} borderRadius="md" boxShadow="md" mb={6}>
      <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
        <Select
          placeholder="תחום"
          value={filters.module ?? ''}
          onChange={(e) => handleChange('module', e.target.value)}
        >
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>

        <Select
          placeholder="סוג"
          value={filters.type ?? ''}
          onChange={(e) => handleChange('type', e.target.value)}
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>

        <Select
          placeholder="דחיפות"
          value={filters.urgency ?? ''}
          onChange={(e) => handleChange('urgency', e.target.value)}
        >
          {urgencyLevels.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>

        <Select
          placeholder="סטטוס"
          value={filters.status ?? ''}
          onChange={(e) => handleChange('status', e.target.value)}
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </SimpleGrid>

      <Button mt={4} size="sm" onClick={clearFilters}>
        נקה סינון
      </Button>
    </Box>
  );
} 