'use client'

import { useState, useEffect } from 'react'
import { 
  Box, 
  VStack, 
  HStack, 
  Text, 
  Button, 
  Tabs, 
  TabList, 
  TabPanels, 
  Tab, 
  TabPanel,
  useColorModeValue,
  Heading,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Badge,
  IconButton,
  Tooltip,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useDisclosure,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider
} from '@chakra-ui/react'
import { FiPlus, FiEdit2, FiTrash2, FiCheck, FiX, FiRefreshCw, FiSettings, FiFilter, FiSearch, FiDownload, FiUpload } from 'react-icons/fi'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

// Types
interface BusinessModule {
  id: number
  module_code: string
  module_name_hebrew: string
  module_name_english: string
  description: string
  icon: string
  active: boolean
}

interface Guideline {
  id: number
  category: 'system' | 'user' | 'examples'
  subcategory: string
  module_id: number
  title: string
  content: string
  user_email: string | null
  validation_status: 'pending' | 'approved' | 'rejected' | 'needs_review'
  ai_feedback: string | null
  ai_improved_version: string | null
  ai_validation_date: string | null
  priority: number
  active: boolean
  tags: string | null
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  module_name_hebrew: string
  module_code: string
  icon: string
}

interface QueryExample {
  id: number
  guideline_id: number
  module_id: number
  user_question: string
  expected_sql: string
  explanation: string
  difficulty_level: 'basic' | 'intermediate' | 'advanced'
  tags: string | null
  active: boolean
  validated: boolean
  created_at: string
  updated_at: string
  created_by: string
  module_name_hebrew: string
  module_code: string
}

export default function ImportantPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const toast = useToast()
  
  // State
  const [modules, setModules] = useState<BusinessModule[]>([])
  const [guidelines, setGuidelines] = useState<Guideline[]>([])
  const [examples, setExamples] = useState<QueryExample[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedModule, setSelectedModule] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('system')
  const [activeTab, setActiveTab] = useState(0)
  
  // Colors
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.600')
  const textColor = useColorModeValue('gray.800', 'white')
  const mutedColor = useColorModeValue('gray.600', 'gray.400')
  
  // Load data
  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    try {
      setLoading(true)
      
      // Load modules
      const modulesResponse = await fetch('/api/guidelines/modules')
      const modulesData = await modulesResponse.json()
      if (modulesData.success) {
        setModules(modulesData.data)
      }
      
      // Load guidelines based on tab
      await loadGuidelines()
      
    } catch (error) {
      console.error('Error loading data:', error)
      toast({
        title: 'שגיאה',
        description: 'שגיאה בטעינת הנתונים',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  const loadGuidelines = async () => {
    try {
      const params = new URLSearchParams()
      
      // Set category based on active tab
      const categories = ['system', 'user', 'examples']
      const category = categories[activeTab]
      params.append('category', category)
      
      // Add user email for user guidelines
      if (category === 'user' && session?.user?.email) {
        params.append('user_email', session.user.email)
      }
      
      // Add module filter
      if (selectedModule) {
        params.append('module_id', selectedModule.toString())
      }
      
      const response = await fetch(`/api/guidelines?${params}`)
      const data = await response.json()
      
      if (data.success) {
        setGuidelines(data.data)
      }
    } catch (error) {
      console.error('Error loading guidelines:', error)
    }
  }

  const loadExamples = async () => {
    try {
      const params = new URLSearchParams()
      
      if (selectedModule) {
        params.append('module_id', selectedModule.toString())
      }
      
      const response = await fetch(`/api/guidelines/examples?${params}`)
      const data = await response.json()
      
      if (data.success) {
        setExamples(data.data)
      }
    } catch (error) {
      console.error('Error loading examples:', error)
    }
  }

  // Reload data when tab or filters change
  useEffect(() => {
    if (activeTab === 2) { // Examples tab
      loadExamples()
    } else {
      loadGuidelines()
    }
  }, [activeTab, selectedModule, session])

  const handleValidateGuideline = async (guidelineId: number) => {
    try {
      const response = await fetch(`/api/guidelines/${guidelineId}/validate`, {
        method: 'POST'
      })
      const data = await response.json()
      
      if (data.success) {
        toast({
          title: 'הנחיה נבדקה בהצלחה',
          description: `המלצת AI: ${data.data.validation.recommended_status}`,
          status: 'success',
          duration: 5000,
        })
        loadGuidelines()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      toast({
        title: 'שגיאה בבדיקת הנחיה',
        description: (error as Error).message || 'שגיאה לא ידועה',
        status: 'error',
        duration: 3000,
      })
    }
  }

  const handleToggleActive = async (guidelineId: number, currentActive: boolean) => {
    try {
      const response = await fetch(`/api/guidelines/${guidelineId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          active: !currentActive,
          updated_by: session?.user?.email || 'anonymous'
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast({
          title: 'הנחיה עודכנה',
          description: `הנחיה ${!currentActive ? 'הופעלה' : 'הושבתה'} בהצלחה`,
          status: 'success',
          duration: 3000,
        })
        loadGuidelines()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      toast({
        title: 'שגיאה בעדכון הנחיה',
        description: (error as Error).message || 'שגיאה לא ידועה',
        status: 'error',
        duration: 3000,
      })
    }
  }

  const getValidationStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'green'
      case 'rejected': return 'red'
      case 'needs_review': return 'yellow'
      default: return 'gray'
    }
  }

  const getValidationStatusText = (status: string) => {
    switch (status) {
      case 'approved': return 'מאושר'
      case 'rejected': return 'נדחה'
      case 'needs_review': return 'נדרש בדיקה'
      default: return 'ממתין'
    }
  }

  const getCategoryText = (category: string) => {
    switch (category) {
      case 'system': return 'מערכת'
      case 'user': return 'משתמש'
      case 'examples': return 'דוגמאות'
      default: return category
    }
  }

  const renderGuidelineCard = (guideline: Guideline) => (
    <Card key={guideline.id} bg={cardBg} shadow="sm" borderColor={borderColor}>
      <CardHeader pb={2}>
        <HStack justify="space-between" align="start">
          <VStack align="start" spacing={1} flex={1}>
            <HStack>
              <Text fontSize="lg" fontWeight="bold" color={textColor}>
                {guideline.title}
              </Text>
              <Badge colorScheme={getValidationStatusColor(guideline.validation_status)}>
                {getValidationStatusText(guideline.validation_status)}
              </Badge>
              {guideline.active && (
                <Badge colorScheme="green">פעיל</Badge>
              )}
            </HStack>
            <HStack spacing={2}>
              <Badge variant="outline" colorScheme="blue">
                {guideline.module_name_hebrew}
              </Badge>
              <Badge variant="outline">
                {getCategoryText(guideline.category)}
              </Badge>
              {guideline.priority > 0 && (
                <Badge colorScheme="purple">
                  עדיפות {guideline.priority}
                </Badge>
              )}
            </HStack>
          </VStack>
          
          <HStack spacing={1}>
            <Tooltip label="בדיקת AI">
              <IconButton
                icon={<FiRefreshCw />}
                size="sm"
                variant="ghost"
                aria-label="בדיקת AI"
                onClick={() => handleValidateGuideline(guideline.id)}
              />
            </Tooltip>
            <Tooltip label="עריכה">
              <IconButton
                icon={<FiEdit2 />}
                size="sm"
                variant="ghost"
                aria-label="עריכה"
                onClick={() => {
                  // TODO: Open edit modal
                }}
              />
            </Tooltip>
            <Tooltip label={guideline.active ? 'השבתה' : 'הפעלה'}>
              <IconButton
                icon={guideline.active ? <FiX /> : <FiCheck />}
                size="sm"
                variant="ghost"
                colorScheme={guideline.active ? 'red' : 'green'}
                aria-label={guideline.active ? 'השבתה' : 'הפעלה'}
                onClick={() => handleToggleActive(guideline.id, guideline.active)}
              />
            </Tooltip>
          </HStack>
        </HStack>
      </CardHeader>
      
      <CardBody pt={0}>
        <Text color={mutedColor} fontSize="sm" noOfLines={3}>
          {guideline.content}
        </Text>
        
        {guideline.ai_feedback && (
          <Box mt={3} p={2} bg={useColorModeValue('blue.50', 'blue.900')} borderRadius="md">
            <Text fontSize="xs" color="blue.600" fontWeight="bold">
              הערות AI:
            </Text>
            <Text fontSize="xs" color="blue.700">
              {guideline.ai_feedback}
            </Text>
          </Box>
        )}
        
        <HStack justify="space-between" mt={3} fontSize="xs" color={mutedColor}>
          <Text>
            נוצר: {new Date(guideline.created_at).toLocaleDateString('he-IL')}
          </Text>
          <Text>
            עדכון: {new Date(guideline.updated_at).toLocaleDateString('he-IL')}
          </Text>
        </HStack>
      </CardBody>
    </Card>
  )

  const renderExampleCard = (example: QueryExample) => (
    <Card key={example.id} bg={cardBg} shadow="sm" borderColor={borderColor}>
      <CardHeader pb={2}>
        <HStack justify="space-between" align="start">
          <VStack align="start" spacing={1} flex={1}>
            <Text fontSize="lg" fontWeight="bold" color={textColor}>
              {example.user_question}
            </Text>
            <HStack spacing={2}>
              <Badge variant="outline" colorScheme="blue">
                {example.module_name_hebrew}
              </Badge>
              <Badge variant="outline" colorScheme="purple">
                {example.difficulty_level}
              </Badge>
              {example.validated && (
                <Badge colorScheme="green">מאומת</Badge>
              )}
            </HStack>
          </VStack>
          
          <HStack spacing={1}>
            <Tooltip label="עריכה">
              <IconButton
                icon={<FiEdit2 />}
                size="sm"
                variant="ghost"
                aria-label="עריכה"
                onClick={() => {
                  // TODO: Open edit example modal
                }}
              />
            </Tooltip>
          </HStack>
        </HStack>
      </CardHeader>
      
      <CardBody pt={0}>
        <Box>
          <Text fontSize="sm" fontWeight="bold" mb={1}>
            SQL מצופה:
          </Text>
          <Box
            bg={useColorModeValue('gray.100', 'gray.700')}
            p={2}
            borderRadius="md"
            fontFamily="mono"
            fontSize="xs"
            overflow="auto"
            maxH="200px"
          >
            <Text>{example.expected_sql}</Text>
          </Box>
        </Box>
        
        {example.explanation && (
          <Box mt={3}>
            <Text fontSize="sm" fontWeight="bold" mb={1}>
              הסבר:
            </Text>
            <Text fontSize="sm" color={mutedColor}>
              {example.explanation}
            </Text>
          </Box>
        )}
        
        <HStack justify="space-between" mt={3} fontSize="xs" color={mutedColor}>
          <Text>
            נוצר: {new Date(example.created_at).toLocaleDateString('he-IL')}
          </Text>
          <Text>
            נוצר על ידי: {example.created_by}
          </Text>
        </HStack>
      </CardBody>
    </Card>
  )

  if (loading) {
    return (
      <VStack spacing={6}>
        <Spinner size="xl" />
        <Text>טוען הנחיות...</Text>
      </VStack>
    )
  }

  return (
    <VStack spacing={6} align="stretch">
      {/* Header */}
      <HStack justify="space-between" align="center">
        <VStack align="start" spacing={1}>
          <Heading size="lg" color={textColor}>
            ניהול הנחיות חשובות
          </Heading>
          <Text color={mutedColor}>
            ניהול הנחיות AI, דוגמאות שאילתות והגדרות מערכת
          </Text>
        </VStack>
        
        <HStack spacing={2}>
          <Menu>
            <MenuButton as={Button} leftIcon={<FiFilter />} variant="outline">
              מודול: {selectedModule ? modules.find(m => m.id === selectedModule)?.module_name_hebrew : 'הכל'}
            </MenuButton>
            <MenuList>
              <MenuItem onClick={() => setSelectedModule(null)}>
                הכל
              </MenuItem>
              <MenuDivider />
              {modules.map(module => (
                <MenuItem key={module.id} onClick={() => setSelectedModule(module.id)}>
                  {module.module_name_hebrew}
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
          
          <Button leftIcon={<FiPlus />} colorScheme="blue">
            הוספת הנחיה
          </Button>
        </HStack>
      </HStack>

      {/* Tabs */}
      <Tabs index={activeTab} onChange={setActiveTab} colorScheme="blue">
        <TabList>
          <Tab>הנחיות מערכת</Tab>
          <Tab>ההנחיות שלי</Tab>
          <Tab>דוגמאות שאילתות</Tab>
        </TabList>

        <TabPanels>
          {/* System Guidelines */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
              {guidelines.filter(g => g.category === 'system').map(renderGuidelineCard)}
            </SimpleGrid>
            
            {guidelines.filter(g => g.category === 'system').length === 0 && (
              <Alert status="info">
                <AlertIcon />
                <AlertTitle>אין הנחיות מערכת</AlertTitle>
                <AlertDescription>
                  לא נמצאו הנחיות מערכת. הוסף הנחיות חדשות כדי להתחיל.
                </AlertDescription>
              </Alert>
            )}
          </TabPanel>

          {/* User Guidelines */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
              {guidelines.filter(g => g.category === 'user').map(renderGuidelineCard)}
            </SimpleGrid>
            
            {guidelines.filter(g => g.category === 'user').length === 0 && (
              <Alert status="info">
                <AlertIcon />
                <AlertTitle>אין הנחיות אישיות</AlertTitle>
                <AlertDescription>
                  לא נמצאו הנחיות אישיות. הוסף הנחיות משלך כדי להתאים את המערכת לצרכים שלך.
                </AlertDescription>
              </Alert>
            )}
          </TabPanel>

          {/* Examples */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
              {examples.map(renderExampleCard)}
            </SimpleGrid>
            
            {examples.length === 0 && (
              <Alert status="info">
                <AlertIcon />
                <AlertTitle>אין דוגמאות</AlertTitle>
                <AlertDescription>
                  לא נמצאו דוגמאות שאילתות. הוסף דוגמאות כדי לשפר את תוצאות ה-AI.
                </AlertDescription>
              </Alert>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </VStack>
  )
} 