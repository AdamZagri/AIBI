import { Box, Button, Badge, HStack, VStack, Text, useColorModeValue } from '@chakra-ui/react';
import { useState } from 'react';
import Select from 'react-select';

export interface FilterState {
  domains: string[];
  types: string[];
  urgencyLevels: string[];
  statuses: string[];
}

export interface DomainFilterProps {
  insights: Array<{ 
    module: string; 
    insight_type: string;
    urgency: string;
    status: string;
    [key: string]: any 
  }>;
  onFilterChange: (filters: FilterState) => void;
}

const DOMAINS = [
  { key: 'מכירות', label: 'מכירות', color: 'blue' },
  { key: 'רכש', label: 'רכש', color: 'green' },
  { key: 'כספים', label: 'כספים', color: 'purple' },
  { key: 'מלאי', label: 'מלאי', color: 'orange' },
  { key: 'לקוחות', label: 'לקוחות', color: 'teal' },
  { key: 'תפעול', label: 'תפעול', color: 'red' },
  { key: 'ייצור', label: 'ייצור', color: 'yellow' },
  { key: 'משולב', label: 'משולב', color: 'gray' },
];

const INSIGHT_TYPES = [
  { label: 'חריגה', value: 'חריגה' },
  { label: 'מגמה', value: 'מגמה' },
  { label: 'קורלציה', value: 'קורלציה' },
  { label: 'הזדמנות', value: 'הזדמנות' },
  { label: 'סיכון', value: 'סיכון' },
  { label: 'דפוס', value: 'דפוס' },
  { label: 'השוואה', value: 'השוואה' },
];
const URGENCY_LEVELS = [
  { label: 'גבוהה', value: 'גבוהה' },
  { label: 'בינונית', value: 'בינונית' },
  { label: 'נמוכה', value: 'נמוכה' },
];
const STATUSES = [
  { label: 'חדש', value: 'new' },
  { label: 'נבדק', value: 'reviewed' },
  { label: 'בוצע', value: 'actioned' },
  { label: 'נדחה', value: 'dismissed' },
  { label: 'פג תוקף', value: 'expired' },
];

export function InsightDomainFilter({ insights, onFilterChange }: DomainFilterProps) {
  const [filters, setFilters] = useState<FilterState>({
    domains: [],
    types: [],
    urgencyLevels: [],
    statuses: [],
  });
  const bg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Count insights per domain
  const domainCounts = insights.reduce((acc, insight) => {
    acc[insight.module] = (acc[insight.module] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleDomainToggle = (domain: string) => {
    const current = filters.domains;
    const newDomains = current.includes(domain)
      ? current.filter((d) => d !== domain)
      : [...current, domain];
    const newFilters = { ...filters, domains: newDomains };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleMultiSelect = (filterType: keyof FilterState, values: any) => {
    const arr = Array.isArray(values) ? values.map((v) => v.value) : [];
    const newFilters = { ...filters, [filterType]: arr };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearAll = () => {
    const emptyFilters = {
      domains: [],
      types: [],
      urgencyLevels: [],
      statuses: [],
    };
    setFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };

  // react-select style override for Chakra look
  const selectStyles = {
    control: (base: any) => ({ ...base, minHeight: '32px', borderRadius: '8px', fontSize: '0.95em' }),
    multiValue: (base: any) => ({ ...base, background: '#e2e8f0', color: '#1a202c' }),
    multiValueLabel: (base: any) => ({ ...base, color: '#1a202c' }),
    option: (base: any, state: any) => ({ ...base, direction: 'rtl', textAlign: 'right', background: state.isSelected ? '#bee3f8' : base.background }),
    menu: (base: any) => ({ ...base, zIndex: 9999 }),
    input: (base: any) => ({ ...base, direction: 'rtl', textAlign: 'right' }),
    placeholder: (base: any) => ({ ...base, direction: 'rtl', textAlign: 'right' }),
  };

  return (
    <Box bg={bg} p={3} borderRadius="md" boxShadow="sm" border="1px solid" borderColor={borderColor} mb={4}>
      <VStack align="stretch" spacing={2}>
        {/* Domain filter as colored buttons */}
        <Box>
          <Text fontSize="sm" fontWeight="bold" mb={1}>תחום</Text>
          <HStack spacing={1} wrap="wrap">
            {DOMAINS.map(({ key, label, color }) => {
              const count = domainCounts[key] || 0;
              const isSelected = filters.domains.includes(key);
              return (
                <Button
                  key={key}
                  size="sm"
                  variant={isSelected ? 'solid' : 'outline'}
                  colorScheme={color}
                  onClick={() => handleDomainToggle(key)}
                  rightIcon={
                    <Badge colorScheme={isSelected ? 'white' : color} variant={isSelected ? 'solid' : 'subtle'} ml={1}>{count}</Badge>
                  }
                >
                  {label}
                </Button>
              );
            })}
          </HStack>
        </Box>
        {/* ComboBoxes row */}
        <HStack spacing={4} align="center" justify="flex-start" wrap="wrap">
          {/* Type filter as react-select MultiSelect ComboBox */}
          <Box minW="170px">
            <Text fontSize="sm" fontWeight="bold" mb={1}>סוג</Text>
            <Select
              options={INSIGHT_TYPES}
              value={INSIGHT_TYPES.filter((o) => filters.types.includes(o.value))}
              onChange={(vals) => handleMultiSelect('types', vals)}
              isMulti
              placeholder="בחר סוג"
              closeMenuOnSelect={false}
              styles={selectStyles}
              isRtl
            />
          </Box>
          {/* Urgency filter as react-select MultiSelect ComboBox */}
          <Box minW="140px">
            <Text fontSize="sm" fontWeight="bold" mb={1}>דחיפות</Text>
            <Select
              options={URGENCY_LEVELS}
              value={URGENCY_LEVELS.filter((o) => filters.urgencyLevels.includes(o.value))}
              onChange={(vals) => handleMultiSelect('urgencyLevels', vals)}
              isMulti
              placeholder="בחר דחיפות"
              closeMenuOnSelect={false}
              styles={selectStyles}
              isRtl
            />
          </Box>
          {/* Status filter as react-select MultiSelect ComboBox */}
          <Box minW="140px">
            <Text fontSize="sm" fontWeight="bold" mb={1}>סטטוס</Text>
            <Select
              options={STATUSES}
              value={STATUSES.filter((o) => filters.statuses.includes(o.value))}
              onChange={(vals) => handleMultiSelect('statuses', vals)}
              isMulti
              placeholder="בחר סטטוס"
              closeMenuOnSelect={false}
              styles={selectStyles}
              isRtl
            />
          </Box>
          {/* Clear all button */}
          <Box alignSelf="flex-end">
            <Button size="xs" variant="ghost" onClick={clearAll}>
              נקה הכל
            </Button>
          </Box>
        </HStack>
      </VStack>
    </Box>
  );
} 