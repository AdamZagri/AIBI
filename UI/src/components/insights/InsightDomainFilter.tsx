import { 
  Box, 
  Button, 
  Badge, 
  HStack, 
  VStack, 
  Text, 
  useColorModeValue, 
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  PopoverCloseButton,
  CheckboxGroup,
  Checkbox,
  Stack
} from '@chakra-ui/react';
import { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';

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

  const handleMultiSelectChange = (filterType: keyof FilterState, values: string[]) => {
    const newFilters = { ...filters, [filterType]: values };
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

  const getFilterButtonText = (filterType: keyof FilterState, defaultText: string) => {
    const selectedCount = filters[filterType].length;
    if (selectedCount === 0) return defaultText;
    if (selectedCount === 1) return filters[filterType][0];
    return `${selectedCount} נבחרו`;
  };

  const FilterPopover = ({ 
    label, 
    filterType, 
    options, 
    defaultText 
  }: { 
    label: string; 
    filterType: keyof FilterState; 
    options: Array<{label: string, value: string}>; 
    defaultText: string;
  }) => (
    <Popover placement="bottom-start">
      <PopoverTrigger>
        <Button 
          variant="outline" 
          size="sm" 
          rightIcon={<FiChevronDown />}
          minW="140px"
          justifyContent="space-between"
        >
          {getFilterButtonText(filterType, defaultText)}
          {filters[filterType].length > 0 && (
            <Badge ml={2} colorScheme="blue" variant="solid">
              {filters[filterType].length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent w="200px">
        <PopoverArrow />
        <PopoverCloseButton />
        <PopoverBody>
          <VStack align="start" spacing={2}>
            <Text fontWeight="bold" fontSize="sm">{label}</Text>
            <CheckboxGroup
              value={filters[filterType]}
              onChange={(values) => handleMultiSelectChange(filterType, values as string[])}
            >
              <Stack spacing={1}>
                {options.map((option) => (
                  <Checkbox key={option.value} value={option.value} size="sm">
                    {option.label}
                  </Checkbox>
                ))}
              </Stack>
            </CheckboxGroup>
          </VStack>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );

  return (
    <Box bg={bg} p={3} borderRadius="md" boxShadow="sm" border="1px solid" borderColor={borderColor} mb={4}>
      <VStack align="stretch" spacing={3}>
        {/* Domain filter as colored buttons */}
        <Box>
          <Text fontSize="sm" fontWeight="bold" mb={2}>תחום</Text>
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
                    <Badge colorScheme={isSelected ? 'white' : color} variant={isSelected ? 'solid' : 'subtle'} ml={1}>
                      {count}
                    </Badge>
                  }
                >
                  {label}
                </Button>
              );
            })}
          </HStack>
        </Box>
        
        {/* Advanced filters row */}
        <Box>
          <Text fontSize="sm" fontWeight="bold" mb={2}>סינונים מתקדמים</Text>
          <HStack spacing={3} align="center" justify="flex-start" wrap="wrap">
            <FilterPopover 
              label="סוג התובנה"
              filterType="types"
              options={INSIGHT_TYPES}
              defaultText="בחר סוג"
            />
            
            <FilterPopover 
              label="רמת דחיפות"
              filterType="urgencyLevels"
              options={URGENCY_LEVELS}
              defaultText="בחר דחיפות"
            />
            
            <FilterPopover 
              label="סטטוס"
              filterType="statuses"
              options={STATUSES}
              defaultText="בחר סטטוס"
            />
            
            {/* Clear all button */}
            <Button size="sm" variant="ghost" onClick={clearAll} colorScheme="red">
              נקה הכל
            </Button>
          </HStack>
        </Box>
      </VStack>
    </Box>
  );
} 