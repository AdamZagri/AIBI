'use client'

import { ReactNode, useState, useEffect } from 'react'
import ErrorBoundary from './ErrorBoundary'
import { 
  Box, 
  VStack, 
  HStack,
  Text,
  Button,
  useColorModeValue,
  Container,
  Heading,
  Flex,
  IconButton,
  useColorMode,
  Avatar,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Icon,
  Tooltip,
  Badge
} from '@chakra-ui/react'
import { FiMessageSquare, FiTrendingUp, FiBarChart, FiSettings, FiMoon, FiSun, FiLogOut, FiCpu } from 'react-icons/fi'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { ReactElement, JSXElementConstructor } from 'react'

interface AppShellProps {
  children: ReactNode
}

interface NavItemProps {
  href: string
  icon: ReactElement<any, string | JSXElementConstructor<any>>
  label: string
  isActive?: boolean
}

const NavItem = ({ href, icon, label, isActive }: NavItemProps) => {
  const bgColor = useColorModeValue(
    isActive ? 'blue.50' : 'transparent',
    isActive ? 'blue.900' : 'transparent'
  )
  const textColor = useColorModeValue(
    isActive ? 'blue.600' : 'gray.700',
    isActive ? 'blue.300' : 'gray.300'
  )
  const hoverBg = useColorModeValue('gray.100', 'gray.700')

  return (
    <Button
      as={Link}
      href={href}
      variant="ghost"
      leftIcon={icon}
      bg={bgColor}
      color={textColor}
      _hover={{ bg: hoverBg }}
      justifyContent="start"
      fontWeight={isActive ? 'semibold' : 'normal'}
      borderRadius="lg"
      h="12"
      px={4}
      w="full"
    >
      {label}
    </Button>
  )
}

export default function AppShell({ children }: AppShellProps) {
  const { data: session } = useSession()
  const { colorMode, toggleColorMode } = useColorMode()
  const router = useRouter()
  const [isClient, setIsClient] = useState(false)

  console.log('🏢 AppShell rendering:', {
    currentPath: router.pathname,
    asPath: router.asPath,
    query: router.query,
    sessionUser: session?.user?.email || 'not authenticated',
    isReady: router.isReady
  })

  // Client-side only hydration fix
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Theme colors
  const bgColor = useColorModeValue('gray.50', 'gray.900')
  const sidebarBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.600')
  const textColor = useColorModeValue('gray.800', 'white')
  const mutedColor = useColorModeValue('gray.600', 'gray.400')

  // Navigation items
  const navItems = [
    { href: '/chat', icon: <FiMessageSquare />, label: 'צ\'אט ERP' },
    { href: '/insights', icon: <FiTrendingUp />, label: 'תובנות' },
    { href: '/dashboards', icon: <FiBarChart />, label: 'דשבורד' },
    { href: '/important', icon: <FiSettings />, label: 'הנחיות' }
  ]

  if (router.pathname === '/login' || !session) {
    return <>{children}</>;
  }

  return (
    <ErrorBoundary>
      <Box minH="100vh" bg={bgColor}>
        <Flex h="100vh">
          {/* Sidebar */}
          <Box
            w="280px"
            bg={sidebarBg}
            borderRight="1px"
            borderColor={borderColor}
            display="flex"
            flexDirection="column"
          >
          {/* Header */}
          <Box p={4} borderBottom="1px" borderColor={borderColor}>
            <HStack spacing={2} align="center" justify="center">
              <Icon as={FiCpu} boxSize={6} color="blue.500" />
              <VStack spacing={1} align="center">
                <Heading size="md" color={textColor} fontWeight="bold">
                  AI-BI
                </Heading>
                <Text fontSize="sm" color={mutedColor} textAlign="center">
                  מערכת בינה מלאכותית
                </Text>
              </VStack>
            </HStack>
          </Box>

          {/* Navigation */}
          <VStack spacing={2} p={4} flex={1}>
            {navItems.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                isActive={router.pathname === item.href}
              />
            ))}
          </VStack>

          {/* User Section */}
          <Box p={4} borderTop="1px" borderColor={borderColor}>
            <HStack justify="space-between" align="center">
              <Menu>
                <MenuButton>
                  <HStack spacing={3}>
                    <Avatar 
                      size="sm" 
                      name={session?.user?.name || 'משתמש'} 
                      src={session?.user?.image || undefined}
                    />
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="medium" color={textColor}>
                        {session?.user?.name || 'משתמש'}
                      </Text>
                      <Text fontSize="xs" color={mutedColor}>
                        {session?.user?.email || 'guest@example.com'}
                      </Text>
                    </VStack>
                  </HStack>
                </MenuButton>
                <MenuList>
                  <MenuItem onClick={() => signOut()}>
                    <FiLogOut style={{ marginRight: '8px' }} />
                    התנתק
                  </MenuItem>
                </MenuList>
              </Menu>
              
              <IconButton
                icon={colorMode === 'light' ? <FiMoon /> : <FiSun />}
                variant="ghost"
                size="sm"
                onClick={toggleColorMode}
                aria-label="Toggle theme"
              />
            </HStack>
          </Box>
        </Box>

        {/* Main Content */}
        <Box flex={1} overflow="auto" display="flex" flexDirection="column">
          {/* Page Content */}
          <Box flex={1} overflow="auto">
            {router.pathname === '/chat' || router.pathname === '/insights' || router.pathname === '/important' ? (
              // These pages handle their own layout with fixed headers
              children
            ) : (
              // Other pages use container
              <Container maxW="container.xl" py={6}>
                {children}
              </Container>
            )}
          </Box>
        </Box>
      </Flex>
    </Box>
    </ErrorBoundary>
  )
}
