// src/components/SimpleAppShell.tsx
'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Box,
  Flex,
  IconButton,
  useDisclosure,
  VStack,
  Text,
  Button,
  Collapse,
  Icon,
  HStack,
} from '@chakra-ui/react';
import {
  ChatIcon,
  InfoIcon,
  RepeatIcon,
  SettingsIcon,
  CalendarIcon,
} from '@chakra-ui/icons';
import {
  FiMenu,
  FiChevronLeft,
  FiChevronDown,
  FiChevronRight,
  FiBarChart2,
  FiDatabase,
  FiDollarSign,
  FiCreditCard,
  FiLogOut,
} from 'react-icons/fi';
import { FaExclamation } from 'react-icons/fa';

function SidebarLink({
  icon,
  href,
  children,
}: {
  icon: any;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href}>
      <Button
        leftIcon={icon}
        variant="ghost"
        justifyContent="start"
        w="100%"
        px={4}
        py={3}
        fontWeight="normal"
        color="white"
        _hover={{ bg: 'gray.700', color: 'white' }}
      >
        {children}
      </Button>
    </Link>
  );
}

export default function SimpleAppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: true });
  const router = useRouter();
  const chatDisclosure = useDisclosure();
  const dashboardsDisclosure = useDisclosure();
  const insightsDisclosure = useDisclosure();
  const settingsDisclosure = useDisclosure();
  const billingDisclosure = useDisclosure();

  const newChat = () => {
    localStorage.removeItem('chatId');
    router.push('/');
  };

  return (
    <Flex direction="row-reverse">
      {/* Sidebar */}
      <Box
        w={isOpen ? '240px' : '70px'}
        h="100vh"
        position="fixed"
        top={0}
        right={0}
        bg="gray.900"
        color="white"
        transition="width 0.3s"
        zIndex={10}
      >
        <Flex
          align="center"
          justify="center"
          h="80px"
          borderBottom="1px solid"
          borderColor="gray.700"
        >
          <Text fontSize={isOpen ? 'xl' : 'lg'} fontWeight="bold">
            {isOpen ? 'תפריט' : 'ERP'}
          </Text>
        </Flex>

        <VStack align="stretch" spacing={1} mt={4}>
          {/* Chat ERP */}
          <Button
            leftIcon={<ChatIcon />}
            rightIcon={
              <Icon
                as={chatDisclosure.isOpen ? FiChevronDown : FiChevronRight}
              />
            }
            variant="ghost"
            justifyContent="start"
            w="100%"
            px={4}
            py={3}
            fontWeight="normal"
            color="white"
            _hover={{ bg: 'gray.700', color: 'white' }}
            onClick={() => {
              newChat();
              chatDisclosure.onToggle();
            }}
          >
            {isOpen && 'Chat ERP'}
          </Button>
          <Collapse in={chatDisclosure.isOpen} animateOpacity>
            <VStack align="stretch" pl={6}>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RepeatIcon />}
                justifyContent="start"
                w="100%"
                color="white"
                _hover={{ bg: 'gray.700' }}
                onClick={newChat}
              >
                {isOpen && 'New Chat'}
              </Button>

              <SidebarLink icon={<FiMenu />} href="/chat-history">
                {isOpen && 'Chat History'}
              </SidebarLink>
            </VStack>
          </Collapse>

          {/* Dashboards */}
          <Button
            leftIcon={<FiBarChart2 />}
            rightIcon={
              <Icon
                as={
                  dashboardsDisclosure.isOpen ? FiChevronDown : FiChevronRight
                }
              />
            }
            variant="ghost"
            justifyContent="start"
            w="100%"
            px={4}
            py={3}
            fontWeight="normal"
            color="white"
            _hover={{ bg: 'gray.700', color: 'white' }}
            onClick={dashboardsDisclosure.onToggle}
          >
            {isOpen && 'Dashboards'}
          </Button>
          <Collapse in={dashboardsDisclosure.isOpen} animateOpacity>
            <VStack align="stretch" pl={6}>
              <SidebarLink icon={<FiMenu />} href="/dashboards/auto">
                {isOpen && 'Auto Dashboards'}
              </SidebarLink>
              <SidebarLink icon={<FiMenu />} href="/dashboards/personal">
                {isOpen && 'Personal Dashboards'}
              </SidebarLink>
            </VStack>
          </Collapse>

          {/* Insights */}
          <Button
            leftIcon={<FiBarChart2 />}
            rightIcon={
              <Icon
                as={insightsDisclosure.isOpen ? FiChevronDown : FiChevronRight}
              />
            }
            variant="ghost"
            justifyContent="start"
            w="100%"
            px={4}
            py={3}
            fontWeight="normal"
            color="white"
            _hover={{ bg: 'gray.700', color: 'white' }}
            onClick={insightsDisclosure.onToggle}
          >
            {isOpen && 'AI Insights'}
          </Button>
          <Collapse in={insightsDisclosure.isOpen} animateOpacity>
            <VStack align="stretch" pl={6}>
              <SidebarLink icon={<FiMenu />} href="/insights">
                {isOpen && 'All Insights'}
              </SidebarLink>
            </VStack>
          </Collapse>

          {/* Settings */}
          <Button
            leftIcon={<SettingsIcon />}
            rightIcon={
              <Icon
                as={settingsDisclosure.isOpen ? FiChevronDown : FiChevronRight}
              />
            }
            variant="ghost"
            justifyContent="start"
            w="100%"
            px={4}
            py={3}
            fontWeight="normal"
            color="white"
            _hover={{ bg: 'gray.700', color: 'white' }}
            onClick={settingsDisclosure.onToggle}
          >
            {isOpen && 'Settings'}
          </Button>
          <Collapse in={settingsDisclosure.isOpen} animateOpacity>
            <VStack align="stretch" pl={6}>
              <SidebarLink icon={<FiDatabase />} href="/settings/connection">
                {isOpen && 'Manage Connection'}
              </SidebarLink>
              <SidebarLink icon={<FiDatabase />} href="/settings/priority">
                {isOpen && 'Priority Data'}
              </SidebarLink>
              <SidebarLink icon={<FiDatabase />} href="/settings/external">
                {isOpen && 'External Data'}
              </SidebarLink>
              <SidebarLink icon={<FaExclamation />} href="/settings/ai">
                {isOpen && 'AI Important'}
              </SidebarLink>
            </VStack>
          </Collapse>

          {/* Billing */}
          <Button
            leftIcon={<FiCreditCard />}
            rightIcon={
              <Icon
                as={billingDisclosure.isOpen ? FiChevronDown : FiChevronRight}
              />
            }
            variant="ghost"
            justifyContent="start"
            w="100%"
            px={4}
            py={3}
            fontWeight="normal"
            color="white"
            _hover={{ bg: 'gray.700', color: 'white' }}
            onClick={billingDisclosure.onToggle}
          >
            {isOpen && 'Billing'}
          </Button>
          <Collapse in={billingDisclosure.isOpen} animateOpacity>
            <VStack align="stretch" pl={6}>
              <SidebarLink icon={<FiMenu />} href="/billing/token">
                {isOpen && 'Token Manage'}
              </SidebarLink>
              <SidebarLink icon={<FiMenu />} href="/billing/plan">
                {isOpen && 'Change Plan'}
              </SidebarLink>
            </VStack>
          </Collapse>

          <SidebarLink icon={<InfoIcon />} href="/about">
            {isOpen && 'About Us'}
          </SidebarLink>
        </VStack>

        {/* Toggle Button */}
        <IconButton
          aria-label="Toggle menu"
          icon={<FiChevronLeft />}
          onClick={onToggle}
          size="sm"
          position="absolute"
          top="10px"
          right={isOpen ? '200px' : '20px'}
          transition="right 0.3s"
          bg="transparent"
          color="white"
          _hover={{ bg: 'gray.700' }}
        />
      </Box>

      {/* Main Content */}
      <Box
        flex="1"
        mr={isOpen ? '240px' : '70px'}
        h="100vh"
        overflow="auto"
        bg="gray.50"
      >
        {/* Header */}
        <Flex
          as="header"
          h="64px"
          bg="teal.700"
          color="white"
          px={6}
          align="center"
          justify="space-between"
          position="relative"
        >
          <Text
            fontWeight="bold"
            fontSize="lg"
            position="absolute"
            left="50%"
            transform="translateX(-50%)"
          >
            מערכת AI לניתוח נתוני ERP
          </Text>
          <HStack spacing={3}>
            {session && (
              <Text fontSize="sm">
                שלום, {session.user?.name ?? session.user?.email}
              </Text>
            )}
            <IconButton
              aria-label="התנתק"
              icon={<FiLogOut />}
              variant="ghost"
              color="white"
              onClick={() => signOut({ callbackUrl: '/' })}
            />
          </HStack>
        </Flex>

        <Box p={4}>{children}</Box>
      </Box>
    </Flex>
  );
} 