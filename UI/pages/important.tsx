// pages/important.tsx
import { useState, useEffect } from 'react'
import { useSession, getSession } from 'next-auth/react'
import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
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
  MenuDivider,
  Collapse,
  Divider,
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Select,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Switch,
  FormHelperText,
  Code
} from '@chakra-ui/react'
import { FiPlus, FiEdit2, FiTrash2, FiCheck, FiX, FiRefreshCw, FiSettings, FiFilter, FiSearch, FiDownload, FiUpload, FiChevronDown, FiChevronRight, FiSave } from 'react-icons/fi'

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
  category: 'system' | 'user' | 'examples' | 'insights'
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
  user_question?: string // Added for examples
  expected_sql?: string // Added for examples
  explanation?: string // Added for examples
  difficulty_level?: string // Added for examples
  validated?: boolean // Added for examples
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
  const [collapsedModules, setCollapsedModules] = useState<Set<number>>(new Set())
  
  // Edit/Add state
  const [editingGuideline, setEditingGuideline] = useState<Guideline | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    module_id: 1,
    category: 'user' as 'system' | 'user' | 'examples' | 'insights',
    active: true,
    tags: ''
  })
  const { isOpen: isEditModalOpen, onOpen: onEditModalOpen, onClose: onEditModalClose } = useDisclosure()
  const { isOpen: isAddModalOpen, onOpen: onAddModalOpen, onClose: onAddModalClose } = useDisclosure()
  const { isOpen: isImportModalOpen, onOpen: onImportModalOpen, onClose: onImportModalClose } = useDisclosure()
  
  // Import state
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importCategory, setImportCategory] = useState<'system' | 'user' | 'examples' | 'insights'>('system')
  const [importMode, setImportMode] = useState<'ai' | 'as-is'>('ai')
  const [importCustomTitle, setImportCustomTitle] = useState<string>('')
  const [importing, setImporting] = useState(false)
  
  // Search state
  const [searchTerm, setSearchTerm] = useState<string>('')
  
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
      const modulesResponse = await fetch('https://aibi.cloudline.co.il/api/guidelines/modules')
      const modulesData = await modulesResponse.json()
      if (modulesData.success) {
        setModules(modulesData.data)
        console.log('📦 Loaded modules:', modulesData.data.length)
      }
      
      // Load guidelines (this now includes examples from the unified table)
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
      
      // Load all guidelines - we'll filter on the client side
      // Add module filter if selected
      if (selectedModule) {
        params.append('module_id', selectedModule.toString())
      }
      
      // Add user email for potential user guidelines
      if (session?.user?.email) {
        params.append('user_email', session.user.email)
      }
      
      const response = await fetch(`https://aibi.cloudline.co.il/api/guidelines?${params}`)
      const data = await response.json()
      
      if (data.success) {
        setGuidelines(data.data)
      } else {
        console.error('❌ Failed to load guidelines:', data.error);
      }
    } catch (error) {
      console.error('💥 Error loading guidelines:', error)
    }
  }

  // פונקציה לטעינת דוגמאות (כעת מהטבלה המאוחדת)
  const loadExamples = async (moduleId?: number, difficulty?: string) => {
    try {
      const params = new URLSearchParams()
      
      if (moduleId) {
        params.append('module_id', moduleId.toString())
      }
      
      if (difficulty) {
        params.append('difficulty_level', difficulty)
      }
      
      const response = await fetch(`https://aibi.cloudline.co.il/api/guidelines?category=examples&${params}`)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Server error response:', errorText)
        throw new Error(`Server returned ${response.status}: ${errorText}`)
      }
      
      const data = await response.json()
      
      if (data.success) {
        console.log(`✅ Loaded ${data.data.length} examples`)
        // המרת הנתונים לפורמט הנדרש
        const processedExamples = data.data.map((guideline: any) => ({
          id: guideline.id,
          user_question: guideline.user_question || guideline.title,
          expected_sql: guideline.expected_sql || 'לא זמין',
          explanation: guideline.explanation || guideline.content,
          module_name_hebrew: guideline.module_name_hebrew || 'כללי',
          difficulty_level: guideline.difficulty_level || 'basic',
          validated: guideline.validated || false,
          created_at: guideline.created_at,
          created_by: guideline.created_by || 'system'
        }))
        setExamples(processedExamples)
      } else {
        console.error('❌ Failed to load examples:', data.error)
        setExamples([])
      }
    } catch (error) {
      console.error('💥 Error loading examples:', error)
      console.log('🔄 Setting mock examples for testing...')
      setExamples([
        {
          id: 1,
          user_question: "מה סך המכירות החודש?",
          expected_sql: "SELECT SUM(סכום_אחרי_הנחה) FROM שורות_מכירה WHERE MONTH(תאריך_חשבונית) = MONTH(NOW())",
          explanation: "שאילתה לסכום כל המכירות בחודש הנוכחי",
          module_name_hebrew: "מכירות",
          difficulty_level: "basic",
          validated: true,
          created_at: new Date().toISOString(),
          created_by: "system"
        },
        {
          id: 2,
          user_question: "איזה מוצרים נמכרו הכי הרבה השבוע?",
          expected_sql: "SELECT קוד_פריט, COUNT(*) as כמות FROM שורות_מכירה WHERE תאריך_חשבונית >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY קוד_פריט ORDER BY כמות DESC",
          explanation: "שאילתה למוצרים הנמכרים ביותר בשבוע האחרון",
          module_name_hebrew: "מכירות",
          difficulty_level: "intermediate",
          validated: true,
          created_at: new Date().toISOString(),
          created_by: "system"
        },
        {
          id: 3,
          user_question: "מה הרווחיות לפי לקוח?",
          expected_sql: "SELECT קוד_לקוח, SUM(סכום_אחרי_הנחה) as סה_מכירות FROM שורות_מכירה GROUP BY קוד_לקוח ORDER BY סה_מכירות DESC",
          explanation: "שאילתה לחישוב סך המכירות לפי לקוח",
          module_name_hebrew: "מכירות",
          difficulty_level: "basic",
          validated: true,
          created_at: new Date().toISOString(),
          created_by: "system"
        }
      ])
    }
  }

  // Reload data when tab or filters change
  useEffect(() => {
    console.log('📊 Active tab changed to:', activeTab);
    // Load guidelines for all tabs since everything is now in the unified table
    console.log('📋 Loading guidelines for tab:', activeTab);
    loadGuidelines()
  }, [activeTab, selectedModule, session])

  const handleValidateGuideline = async (guidelineId: number) => {
    try {
      const response = await fetch(`https://aibi.cloudline.co.il/api/guidelines/${guidelineId}/validate`, {
        method: 'POST'
      })
      const data = await response.json()
      
      if (data.success) {
        toast({
          title: 'הנחיה נבדקה בהצלחה',
          description: `המלצת AI: ${data.data?.validation?.recommended_status || 'אושרה'}`,
          status: 'success',
          duration: 5000,
        })
        loadGuidelines()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error('❌ Error validating guideline:', error);
      toast({
        title: 'שגיאה בבדיקת הנחיה',
        description: (error as Error).message || 'שגיאה לא ידועה',
        status: 'error',
        duration: 3000,
      })
    }
  }

  const handleToggleActive = async (guidelineId: number, currentActive: boolean | number) => {
    try {
      // המרה מפורשת לבוליאן כי DB מחזיר 0/1
      const isCurrentlyActive = Boolean(currentActive)
      console.log('🔄 Toggling active for guideline:', guidelineId, 'from', currentActive, '(boolean:', isCurrentlyActive, ') to', !isCurrentlyActive);
      
      const url = `https://aibi.cloudline.co.il/api/guidelines/${guidelineId}`;
      console.log('🔗 Request URL:', url);
      
      const requestBody = {
        active: !isCurrentlyActive, // שולח את הערך ההפוך
        updated_by: session?.user?.email || 'anonymous'
      };
      console.log('📦 Request body:', requestBody);
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })
      
      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server error response:', errorText);
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }
      
      const data = await response.json()
      console.log('📊 Toggle response:', data);
      
      if (data.success) {
        console.log(`📱 Toggled from ${isCurrentlyActive} to ${!isCurrentlyActive}`);
        // אם הנחיה הייתה פעילה (isCurrentlyActive=true) ועברנו ל-false, זה אומר שהושבתה
        // אם הנחיה הייתה לא פעילה (isCurrentlyActive=false) ועברנו ל-true, זה אומר שהופעלה
        const message = isCurrentlyActive ? 'הושבתה' : 'הופעלה';
        console.log(`📢 Message: הנחיה ${message} בהצלחה`);
        
        toast({
          title: 'הנחיה עודכנה',
          description: `הנחיה ${message} בהצלחה`,
          status: 'success',
          duration: 3000,
        })
        loadGuidelines()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error('❌ Error toggling guideline:', error);
      
      // Better error message for network issues
      let errorMessage = 'שגיאה לא ידועה';
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        errorMessage = 'בעיה בחיבור לשרת. וודא שהשרת רץ על https://aibi.cloudline.co.il';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        title: 'שגיאה בעדכון הנחיה',
        description: errorMessage,
        status: 'error',
        duration: 5000,
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
      case 'insights': return 'תובנות'
      default: return category
    }
  }

  // Filter guidelines based on search term
  const filterGuidelinesBySearch = (guidelines: Guideline[]) => {
    if (!searchTerm.trim()) return guidelines;
    
    const term = searchTerm.toLowerCase();
    return guidelines.filter(g => 
      g.title.toLowerCase().includes(term) ||
      g.content.toLowerCase().includes(term) ||
      g.tags?.toLowerCase().includes(term) ||
      g.created_by?.toLowerCase().includes(term) ||
      g.module_name_hebrew?.toLowerCase().includes(term)
    );
  };

  // Edit/Add functions
  const openEditModal = (guideline: Guideline) => {
    setEditingGuideline(guideline)
    setIsEditing(true)
    setFormData({
      title: guideline.title,
      content: guideline.content,
      module_id: guideline.module_id,
      category: guideline.category,
      active: guideline.active,
      tags: guideline.tags || ''
    })
    onEditModalOpen()
  }

  const openAddModal = () => {
    setEditingGuideline(null)
    setIsEditing(false)
    setFormData({
      title: '',
      content: '',
      module_id: 1,
      category: 'user',
      active: true,
      tags: ''
    })
    onAddModalOpen()
  }

  const handleSaveGuideline = async () => {
    try {
      const url = isEditing 
        ? `https://aibi.cloudline.co.il/api/guidelines/${editingGuideline!.id}`
        : 'https://aibi.cloudline.co.il/api/guidelines'
      
      const method = isEditing ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          created_by: session?.user?.email || 'anonymous',
          updated_by: session?.user?.email || 'anonymous'
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast({
          title: isEditing ? 'הנחיה עודכנה' : 'הנחיה נוספה',
          description: `הנחיה ${isEditing ? 'עודכנה' : 'נוספה'} בהצלחה`,
          status: 'success',
          duration: 3000,
        })
        
        // Close modal and reload
        if (isEditing) {
          onEditModalClose()
        } else {
          onAddModalClose()
        }
        
        loadGuidelines()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      toast({
        title: 'שגיאה',
        description: (error as Error).message || 'שגיאה לא ידועה',
        status: 'error',
        duration: 3000,
      })
    }
  }

  const handleDeleteGuideline = async (guidelineId: number) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק הנחיה זו?')) return
    
    try {
      console.log('🗑️ Deleting guideline:', guidelineId);
      const response = await fetch(`https://aibi.cloudline.co.il/api/guidelines/${guidelineId}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      console.log('📊 Delete response:', data);
      
      if (data.success) {
        toast({
          title: 'הנחיה נמחקה',
          description: 'הנחיה נמחקה בהצלחה',
          status: 'success',
          duration: 3000,
        })
        loadGuidelines()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error('❌ Error deleting guideline:', error);
      toast({
        title: 'שגיאה במחיקת הנחיה',
        description: (error as Error).message || 'שגיאה לא ידועה',
        status: 'error',
        duration: 3000,
      })
    }
  }

  // פונקציות הפעלה/השבתה גורפת
  const handleBulkToggle = async (guidelines: any[], activate: boolean) => {
    try {
      const promises = guidelines.map(guideline => 
        fetch(`https://aibi.cloudline.co.il/api/guidelines/${guideline.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...guideline,
            active: activate
          })
        })
      );

      await Promise.all(promises);
      
      toast({
        title: activate ? 'הופעלו בהצלחה' : 'הושבתו בהצלחה',
        description: `${guidelines.length} הנחיות ${activate ? 'הופעלו' : 'הושבתו'}`,
        status: 'success',
        duration: 3000,
      });
      
      await loadGuidelines();
    } catch (error) {
      console.error('❌ Error in bulk toggle:', error);
      toast({
        title: 'שגיאה',
        description: 'שגיאה בעדכון ההנחיות',
        status: 'error',
        duration: 3000,
      });
    }
  };

  const handleImportFile = async () => {
    if (!importFile) return
    
    try {
      setImporting(true)
      
      const formData = new FormData()
      formData.append('file', importFile)
      formData.append('category', importCategory)
      formData.append('mode', importMode)
      formData.append('userEmail', session?.user?.email || 'unknown@user.com')
      if (importMode === 'as-is' && importCustomTitle) {
        formData.append('customTitle', importCustomTitle)
      }
      
      const response = await fetch('https://aibi.cloudline.co.il/api/guidelines/import/file', {
        method: 'POST',
        body: formData
      })
      
      const data = await response.json()
      
      if (data.success) {
        const details = data.details?.guidelines || [];
        const detailsText = details.length > 0 
          ? `נוצרו: ${details.map(g => g.title).join(', ')}`
          : `נוצרו ${data.count} הנחיות`;
          
        toast({
          title: 'ייבוא הושלם בהצלחה',
          description: `${detailsText} (מצב: ${data.mode === 'ai' ? 'AI מטופל' : 'כמו שהם'})`,
          status: 'success',
          duration: 7000,
          isClosable: true
        })
        onImportModalClose()
        setImportFile(null)
        setImportCustomTitle('')
        loadGuidelines()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      toast({
        title: 'שגיאה בייבוא',
        description: (error as Error).message || 'שגיאה לא ידועה',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setImporting(false)
    }
  }

  // Module collapse/expand management
  const toggleModule = (moduleId: number) => {
    setCollapsedModules(prev => {
      const newSet = new Set(prev)
      if (newSet.has(moduleId)) {
        newSet.delete(moduleId)
      } else {
        newSet.add(moduleId)
      }
      return newSet
    })
  }

  // Group guidelines by module
  const groupGuidelinesByModule = (guidelines: Guideline[]) => {
    const grouped: Record<string, Guideline[]> = {}
    
    guidelines.forEach(guideline => {
      const moduleId = guideline.module_id.toString()
      if (!grouped[moduleId]) {
        grouped[moduleId] = []
      }
      grouped[moduleId].push(guideline)
    })
    
    return grouped
  }

  // Render compact guideline card
  const renderCompactGuidelineCard = (guideline: Guideline) => {
    const isExample = guideline.category === 'examples'
    const displayTitle = isExample ? guideline.user_question || guideline.title : guideline.title
    const displayContent = isExample ? guideline.explanation || guideline.content : guideline.content
    
    // המרה מפורשת לבוליאן - DB מחזיר 0/1, צריך true/false
    const isActive = Boolean(guideline.active)
    
    return (
      <Card key={guideline.id} bg={cardBg} shadow="sm" borderColor={borderColor} size="sm" cursor="pointer">
        <CardBody py={3}>
          <Flex justify="space-between" align="center">
            <VStack align="start" spacing={1} flex={1} onClick={() => openEditModal(guideline)}>
              <HStack spacing={2}>
                <Badge size="sm" colorScheme={isExample ? "purple" : "gray"}>#{guideline.id}</Badge>
                <Text fontSize="md" fontWeight="semibold" color={textColor} noOfLines={1}>
                  {displayTitle}
                </Text>
                {guideline.created_by?.includes('IMPORT') && (
                  <Badge size="sm" colorScheme="green">מקובץ</Badge>
                )}
                {guideline.created_by?.includes('AI_IMPORT') && (
                  <Badge size="sm" colorScheme="blue">AI</Badge>
                )}
              </HStack>
              <Text color={mutedColor} fontSize="sm" noOfLines={2}>
                {displayContent}
              </Text>
              {isExample && guideline.expected_sql && (
                <Box bg={useColorModeValue('gray.100', 'gray.700')} p={2} borderRadius="md" w="full" mt={1}>
                  <Text fontSize="xs" color={mutedColor} mb={1}>
                    SQL Query:
                  </Text>
                  <Code 
                    display="block" 
                    whiteSpace="pre-wrap" 
                    fontSize="xs" 
                    p={1}
                    textAlign="left"
                    direction="ltr"
                    fontFamily="monospace"
                  >
                    {guideline.expected_sql.slice(0, 100)}...
                  </Code>
                </Box>
              )}
            </VStack>
          
          <HStack spacing={1}>
            <Tooltip label="בדיקת AI">
              <IconButton
                icon={<FiRefreshCw />}
                size="sm"
                variant="ghost"
                aria-label="בדיקת AI"
                onClick={(e) => {
                  e.stopPropagation();
                  handleValidateGuideline(guideline.id);
                }}
              />
            </Tooltip>
            <Tooltip label="עריכה">
              <IconButton
                icon={<FiEdit2 />}
                size="sm"
                variant="ghost"
                aria-label="עריכה"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditModal(guideline);
                }}
              />
            </Tooltip>
            <Tooltip label={isActive ? 'השבתה' : 'הפעלה'}>
              <IconButton
                icon={isActive ? <FiCheck /> : <FiX />}
                size="sm"
                variant="ghost"
                colorScheme={isActive ? 'green' : 'red'}
                aria-label={isActive ? 'השבתה' : 'הפעלה'}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log(`🔘 Button clicked - Guideline #${guideline.id}, active value:`, guideline.active, 'converted to boolean:', isActive);
                  handleToggleActive(guideline.id, guideline.active);
                }}
              />
            </Tooltip>
            <Tooltip label="מחיקה">
              <IconButton
                icon={<FiTrash2 />}
                size="sm"
                variant="ghost"
                colorScheme="red"
                aria-label="מחיקה"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteGuideline(guideline.id);
                }}
              />
            </Tooltip>
          </HStack>
        </Flex>
      </CardBody>
    </Card>
    )
  }

  // Render module group with collapsible functionality
  const renderModuleGroup = (moduleId: string, moduleGuidelines: Guideline[]) => {
    const moduleIdNum = parseInt(moduleId)
    const module = modules.find(m => m.id === moduleIdNum)
    if (!module) return null
    
    const isCollapsed = collapsedModules.has(moduleIdNum)
    
    return (
      <Box key={moduleId} mb={4}>
        <Button
          onClick={() => toggleModule(moduleIdNum)}
          variant="ghost"
          size="sm"
          w="full"
          justifyContent="space-between"
          rightIcon={isCollapsed ? <FiChevronRight /> : <FiChevronDown />}
          mb={2}
        >
          <HStack>
            <Text fontWeight="bold">{module.module_name_hebrew}</Text>
            <Badge colorScheme="blue" size="sm">
              {moduleGuidelines.length} הנחיות
            </Badge>
          </HStack>
        </Button>
        
        <Collapse in={!isCollapsed} animateOpacity>
          <VStack spacing={2} align="stretch">
            {moduleGuidelines.map(renderCompactGuidelineCard)}
          </VStack>
        </Collapse>
      </Box>
    )
  }

  const renderGuidelineCard = (guideline: Guideline) => (
    <Card key={guideline.id} bg={cardBg} shadow="sm" borderColor={borderColor}>
      <CardHeader pb={2}>
        <HStack justify="space-between" align="start">
          <VStack align="start" spacing={1} flex={1}>
            <HStack>
              <Badge size="sm" colorScheme="gray">#{guideline.id}</Badge>
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
                onClick={() => openEditModal(guideline)}
              />
            </Tooltip>
            <Tooltip label={Boolean(guideline.active) ? 'השבתה' : 'הפעלה'}>
              <IconButton
                icon={Boolean(guideline.active) ? <FiCheck /> : <FiX />}
                size="sm"
                variant="ghost"
                colorScheme={Boolean(guideline.active) ? 'green' : 'red'}
                aria-label={Boolean(guideline.active) ? 'השבתה' : 'הפעלה'}
                onClick={() => {
                  const isActive = Boolean(guideline.active);
                  console.log(`🔘 Button clicked (location 2) - Guideline #${guideline.id}, active value:`, guideline.active, 'converted to boolean:', isActive);
                  handleToggleActive(guideline.id, guideline.active);
                }}
              />
            </Tooltip>
            <Tooltip label="מחיקה">
              <IconButton
                icon={<FiTrash2 />}
                size="sm"
                variant="ghost"
                aria-label="מחיקה"
                onClick={() => handleDeleteGuideline(guideline.id)}
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
            <HStack>
              <Badge size="sm" colorScheme="purple">#{example.id}</Badge>
              <Text fontSize="lg" fontWeight="bold" color={textColor}>
                {example.user_question}
              </Text>
            </HStack>
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
    <Box minH="100vh" bg={useColorModeValue('gray.50', 'gray.900')} overflowY="auto">
      {/* Sticky Page Header */}
      <Box
        position="sticky"
        top="0"
        bg={cardBg}
        borderBottom="1px"
        borderColor={borderColor}
        zIndex={999}
        px={6}
        py={4}
        mb={4}
        boxShadow="sm"
      >
        <VStack align="start" spacing={2}>
          <Heading size="lg" color={textColor}>הנחיות למערכת AI</Heading>
          <Text color={mutedColor} fontSize="sm" maxW="600px">
            עדכן את הנחיות המערכת כדי לדייק את התשובות ואת התובנות של המערכת לצרכים שלך
          </Text>
          <Text color={mutedColor} fontSize="xs">
            {guidelines.length} הנחיות | {modules.filter(m => m.id !== 5).length} מודולים עסקיים
          </Text>
        </VStack>
        
        {/* Action Bar */}
        <HStack spacing={3} justify="space-between" flexWrap="wrap" mt={4}>
          <HStack spacing={3}>
            {/* Search */}
            <Box minW="300px">
              <Input
                placeholder="חפש הנחיות..."
                size="sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                leftElement={<FiSearch />}
              />
              {searchTerm && (
                <Button 
                  size="xs" 
                  variant="ghost" 
                  onClick={() => setSearchTerm('')}
                  mt={1}
                >
                  נקה חיפוש
                </Button>
              )}
            </Box>
            
            <Menu>
              <MenuButton as={Button} leftIcon={<FiFilter />} variant="outline" size="sm">
                {selectedModule ? modules.find(m => m.id === selectedModule)?.module_name_hebrew : 'כל המודולים'}
              </MenuButton>
              <MenuList>
                <MenuItem onClick={() => setSelectedModule(null)}>כל המודולים</MenuItem>
                <MenuDivider />
                {modules.filter(m => m.id !== 5).map(module => (
                  <MenuItem key={module.id} onClick={() => setSelectedModule(module.id)}>
                    {module.module_name_hebrew}
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
          </HStack>
          
          <HStack spacing={2}>
            <Button leftIcon={<FiUpload />} variant="outline" size="sm" colorScheme="green" onClick={onImportModalOpen}>
              ייבוא קובץ
            </Button>
            
            <Button leftIcon={<FiPlus />} colorScheme="blue" size="sm" onClick={openAddModal}>
              הוספת הנחיה
            </Button>
          </HStack>
        </HStack>
      </Box>

      {/* Main Content */}
      <VStack spacing={6} align="stretch" px={6} pb={6}>
        {/* Tabs */}
        <Tabs index={activeTab} onChange={setActiveTab} colorScheme="blue">
          <TabList>
            <Tab>הנחיות מערכת ({guidelines.filter(g => g.category === 'system').length})</Tab>
            <Tab>ההנחיות שלי ({guidelines.filter(g => g.category === 'user').length})</Tab>
            <Tab>דוגמאות שאילתות ({guidelines.filter(g => g.category === 'examples').length})</Tab>
            <Tab>הנחיות לתובנות ({guidelines.filter(g => g.category === 'insights').length})</Tab>
          </TabList>

          <TabPanels>
              {/* System Guidelines */}
              <TabPanel px={0}>
                {(() => {
                  const systemGuidelines = guidelines.filter(g => 
                    g.category === 'system' // Only system category
                  )
                  const filteredGuidelines = filterGuidelinesBySearch(systemGuidelines)
                  const groupedGuidelines = groupGuidelinesByModule(filteredGuidelines)
                  
                  return (
                    <VStack align="stretch" spacing={4}>
                      {/* Bulk Action Buttons */}
                      {filteredGuidelines.length > 0 && (
                        <HStack justify="flex-start" spacing={2} mb={4}>
                          <Button
                            size="sm"
                            colorScheme="green"
                            variant="outline"
                            leftIcon={<FiCheck />}
                            onClick={() => handleBulkToggle(filteredGuidelines, true)}
                          >
                            הפעל הכל ({filteredGuidelines.length})
                          </Button>
                          <Button
                            size="sm"
                            colorScheme="red"
                            variant="outline"
                            leftIcon={<FiX />}
                            onClick={() => handleBulkToggle(filteredGuidelines, false)}
                          >
                            השבת הכל ({filteredGuidelines.length})
                          </Button>
                        </HStack>
                      )}
                      
                      {filteredGuidelines.length === 0 ? (
                        <Alert status="info">
                          <AlertIcon />
                          <AlertTitle>{searchTerm ? 'לא נמצאו תוצאות' : 'אין הנחיות מערכת'}</AlertTitle>
                          <AlertDescription>
                            {searchTerm 
                              ? `לא נמצאו הנחיות מערכת התואמות את החיפוש "${searchTerm}"`
                              : 'לא נמצאו הנחיות מערכת. הוסף הנחיות חדשות כדי להתחיל.'
                            }
                          </AlertDescription>
                        </Alert>
                      ) : (
                        Object.entries(groupedGuidelines).map(([moduleId, moduleGuidelines]) => 
                          renderModuleGroup(moduleId, moduleGuidelines)
                        )
                      )}
                    </VStack>
                  )
                })()}
              </TabPanel>

              {/* User Guidelines */}
              <TabPanel px={0}>
                {(() => {
                  const userGuidelines = guidelines.filter(g => g.category === 'user')
                  const filteredGuidelines = filterGuidelinesBySearch(userGuidelines)
                  const groupedGuidelines = groupGuidelinesByModule(filteredGuidelines)
                  
                  return (
                    <VStack align="stretch" spacing={4}>
                      {/* Bulk Action Buttons */}
                      {filteredGuidelines.length > 0 && (
                        <HStack justify="flex-start" spacing={2} mb={4}>
                          <Button
                            size="sm"
                            colorScheme="green"
                            variant="outline"
                            leftIcon={<FiCheck />}
                            onClick={() => handleBulkToggle(filteredGuidelines, true)}
                          >
                            הפעל הכל ({filteredGuidelines.length})
                          </Button>
                          <Button
                            size="sm"
                            colorScheme="red"
                            variant="outline"
                            leftIcon={<FiX />}
                            onClick={() => handleBulkToggle(filteredGuidelines, false)}
                          >
                            השבת הכל ({filteredGuidelines.length})
                          </Button>
                        </HStack>
                      )}
                      
                      {filteredGuidelines.length === 0 ? (
                        <Alert status="info">
                          <AlertIcon />
                          <AlertTitle>{searchTerm ? 'לא נמצאו תוצאות' : 'אין הנחיות אישיות'}</AlertTitle>
                          <AlertDescription>
                            {searchTerm 
                              ? `לא נמצאו הנחיות אישיות התואמות את החיפוש "${searchTerm}"`
                              : 'לא נמצאו הנחיות אישיות. הוסף הנחיות חדשות כדי להתחיל.'
                            }
                          </AlertDescription>
                        </Alert>
                      ) : (
                        Object.entries(groupedGuidelines).map(([moduleId, moduleGuidelines]) => 
                          renderModuleGroup(moduleId, moduleGuidelines)
                        )
                      )}
                    </VStack>
                  )
                })()}
              </TabPanel>

              {/* Examples */}
              <TabPanel px={0}>
                {(() => {
                  const examplesGuidelines = guidelines.filter(g => 
                    g.category === 'examples' // Only examples category
                  )
                  const filteredGuidelines = filterGuidelinesBySearch(examplesGuidelines)
                  const groupedGuidelines = groupGuidelinesByModule(filteredGuidelines)
                  
                  return (
                    <VStack align="stretch" spacing={4}>
                      {/* Bulk Action Buttons */}
                      {filteredGuidelines.length > 0 && (
                        <HStack justify="flex-start" spacing={2} mb={4}>
                          <Button
                            size="sm"
                            colorScheme="green"
                            variant="outline"
                            leftIcon={<FiCheck />}
                            onClick={() => handleBulkToggle(filteredGuidelines, true)}
                          >
                            הפעל הכל ({filteredGuidelines.length})
                          </Button>
                          <Button
                            size="sm"
                            colorScheme="red"
                            variant="outline"
                            leftIcon={<FiX />}
                            onClick={() => handleBulkToggle(filteredGuidelines, false)}
                          >
                            השבת הכל ({filteredGuidelines.length})
                          </Button>
                        </HStack>
                      )}
                      
                      {filteredGuidelines.length === 0 ? (
                        <Alert status="info">
                          <AlertIcon />
                          <AlertTitle>{searchTerm ? 'לא נמצאו תוצאות' : 'אין דוגמאות SQL'}</AlertTitle>
                          <AlertDescription>
                            {searchTerm 
                              ? `לא נמצאו דוגמאות SQL התואמות את החיפוש "${searchTerm}"`
                              : 'לא נמצאו דוגמאות SQL. הוסף דוגמאות כדי לעזור למערכת לכתוב שאילתות מדויקות יותר.'
                            }
                          </AlertDescription>
                        </Alert>
                      ) : (
                        Object.entries(groupedGuidelines).map(([moduleId, moduleGuidelines]) => 
                          renderModuleGroup(moduleId, moduleGuidelines)
                        )
                      )}
                    </VStack>
                  )
                })()}
              </TabPanel>

              {/* Insights */}
              <TabPanel px={0}>
                {(() => {
                  const insightsGuidelines = guidelines.filter(g => g.category === 'insights')
                  const filteredGuidelines = filterGuidelinesBySearch(insightsGuidelines)
                  const groupedGuidelines = groupGuidelinesByModule(filteredGuidelines)
                  
                  return (
                    <VStack align="stretch" spacing={4}>
                      {/* Bulk Action Buttons */}
                      {filteredGuidelines.length > 0 && (
                        <HStack justify="flex-start" spacing={2} mb={4}>
                          <Button
                            size="sm"
                            colorScheme="green"
                            variant="outline"
                            leftIcon={<FiCheck />}
                            onClick={() => handleBulkToggle(filteredGuidelines, true)}
                          >
                            הפעל הכל ({filteredGuidelines.length})
                          </Button>
                          <Button
                            size="sm"
                            colorScheme="red"
                            variant="outline"
                            leftIcon={<FiX />}
                            onClick={() => handleBulkToggle(filteredGuidelines, false)}
                          >
                            השבת הכל ({filteredGuidelines.length})
                          </Button>
                        </HStack>
                      )}
                      
                      {filteredGuidelines.length === 0 ? (
                        <Alert status="info">
                          <AlertIcon />
                          <AlertTitle>{searchTerm ? 'לא נמצאו תוצאות' : 'אין הנחיות לתובנות'}</AlertTitle>
                          <AlertDescription>
                            {searchTerm 
                              ? `לא נמצאו הנחיות לתובנות התואמות את החיפוש "${searchTerm}"`
                              : 'לא נמצאו הנחיות לתובנות. הוסף הנחיות חדשות כדי להתחיל.'
                            }
                          </AlertDescription>
                        </Alert>
                      ) : (
                        Object.entries(groupedGuidelines).map(([moduleId, moduleGuidelines]) => 
                          renderModuleGroup(moduleId, moduleGuidelines)
                        )
                      )}
                    </VStack>
                  )
                })()}
              </TabPanel>
            </TabPanels>
          </Tabs>
        </VStack>

        {/* Edit/Add Modal */}
        <Modal isOpen={isEditModalOpen || isAddModalOpen} onClose={isEditModalOpen ? onEditModalClose : onAddModalClose} size="xl">
          <ModalOverlay />
          <ModalContent maxW="900px" fontSize="sm">
            <ModalHeader fontSize="lg">{isEditing ? 'עריכת הנחיה' : 'הוספת הנחיה חדשה'}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing={3}>
                <FormControl>
                  <FormLabel fontSize="sm">כותרת הנחיה</FormLabel>
                  <Input
                    size="sm"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">תוכן הנחיה</FormLabel>
                  <Textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    rows={12}
                    resize="vertical"
                    placeholder="הזן את תוכן ההנחיה..."
                    fontSize="sm"
                    fontFamily="monospace"
                    lineHeight="1.4"
                  />
                </FormControl>
                <HStack spacing={4} w="100%" align="start">
                  <FormControl flex="1">
                    <FormLabel fontSize="sm">מודול</FormLabel>
                    <HStack spacing={1} flexWrap="wrap">
                      {modules.filter(m => m.id !== 5).map(module => (
                        <Button
                          key={module.id}
                          size="xs"
                          variant={formData.module_id === module.id ? "solid" : "outline"}
                          colorScheme={formData.module_id === module.id ? "blue" : "gray"}
                          onClick={() => setFormData({ ...formData, module_id: module.id })}
                          fontSize="xs"
                        >
                          {module.module_name_hebrew}
                        </Button>
                      ))}
                    </HStack>
                  </FormControl>
                  <FormControl flex="1">
                    <FormLabel fontSize="sm">קטגוריה</FormLabel>
                    <HStack spacing={1} flexWrap="wrap">
                      {[
                        { value: 'system', label: 'מערכת' },
                        { value: 'user', label: 'משתמש' },
                        { value: 'examples', label: 'דוגמאות' },
                        { value: 'insights', label: 'תובנות' }
                      ].map(cat => (
                        <Button
                          key={cat.value}
                          size="xs"
                          variant={formData.category === cat.value ? "solid" : "outline"}
                          colorScheme={formData.category === cat.value ? "blue" : "gray"}
                          onClick={() => setFormData({ ...formData, category: cat.value as 'system' | 'user' | 'examples' | 'insights' })}
                          fontSize="xs"
                        >
                          {cat.label}
                        </Button>
                      ))}
                    </HStack>
                  </FormControl>
                </HStack>
                <HStack spacing={4} w="100%">
                  <FormControl flex="2">
                    <FormLabel fontSize="sm">תגיות (אפשרי)</FormLabel>
                    <Input
                      size="sm"
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      placeholder="תגיות מופרדות בפסיקים"
                    />
                  </FormControl>
                  <FormControl flex="1">
                    <FormLabel fontSize="sm">פעיל</FormLabel>
                    <Switch
                      size="sm"
                      isChecked={formData.active}
                      onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    />
                  </FormControl>
                </HStack>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button size="sm" variant="ghost" mr={3} onClick={isEditModalOpen ? onEditModalClose : onAddModalClose}>
                ביטול
              </Button>
              <Button size="sm" colorScheme="blue" onClick={handleSaveGuideline}>
                {isEditing ? 'שמור שינויים' : 'הוסף הנחיה'}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Import Modal */}
        <Modal isOpen={isImportModalOpen} onClose={onImportModalClose}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>ייבוא קובץ הנחיות</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing={4}>
                <FormControl>
                  <FormLabel>קובץ להעלאה</FormLabel>
                  <Input
                    type="file"
                    accept=".txt,.md"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  />
                  <FormHelperText>בחר קובץ טקסט (.txt) או מרקדאון (.md)</FormHelperText>
                </FormControl>
                
                <FormControl>
                  <FormLabel>קטגוריה</FormLabel>
                  <HStack spacing={2} flexWrap="wrap">
                    {[
                      { value: 'system', label: 'מערכת' },
                      { value: 'user', label: 'משתמש' },
                      { value: 'examples', label: 'דוגמאות' },
                      { value: 'insights', label: 'תובנות' }
                    ].map(cat => (
                      <Button
                        key={cat.value}
                        size="sm"
                        variant={importCategory === cat.value ? "solid" : "outline"}
                        colorScheme={importCategory === cat.value ? "blue" : "gray"}
                        onClick={() => setImportCategory(cat.value as 'system' | 'user' | 'examples' | 'insights')}
                      >
                        {cat.label}
                      </Button>
                    ))}
                  </HStack>
                </FormControl>
                
                <FormControl>
                  <FormLabel>מצב ייבוא</FormLabel>
                  <HStack spacing={2} flexWrap="wrap">
                    {[
                      { value: 'ai', label: 'AI מטופל' },
                      { value: 'as-is', label: 'כמו שהם' }
                    ].map(mode => (
                      <Button
                        key={mode.value}
                        size="sm"
                        variant={importMode === mode.value ? "solid" : "outline"}
                        colorScheme={importMode === mode.value ? "blue" : "gray"}
                        onClick={() => setImportMode(mode.value as 'ai' | 'as-is')}
                      >
                        {mode.label}
                      </Button>
                    ))}
                  </HStack>
                </FormControl>
                 
                {importMode === 'as-is' && (
                  <FormControl>
                    <FormLabel>כותרת להנחיה (אופציונלי)</FormLabel>
                    <Input
                      size="sm"
                      value={importCustomTitle}
                      onChange={(e) => setImportCustomTitle(e.target.value)}
                      placeholder="הזן כותרת מותאמת אישית או השאר ריק לכותרת אוטומטית"
                    />
                  </FormControl>
                )}

                <Alert status="info" size="sm">
                  <AlertIcon />
                  <AlertDescription>
                    {importMode === 'ai' 
                      ? 'הקובץ יעובד באמצעות AI ויחולק להנחיות מרובות. השירות יזהה דוגמאות SQL וינתח את התוכן.'
                      : 'הקובץ יועלה כהנחיה אחת ללא עיבוד. כל התוכן יישמר כמו שהוא.'
                    }
                  </AlertDescription>
                </Alert>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={onImportModalClose}>
                ביטול
              </Button>
              <Button 
                colorScheme="green" 
                onClick={handleImportFile}
                isLoading={importing}
                loadingText="מייבא..."
                isDisabled={!importFile}
              >
                יבא קובץ
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Box>
    )
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