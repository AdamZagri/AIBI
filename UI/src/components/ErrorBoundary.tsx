'use client';

import { Component, ReactNode } from 'react';
import { Box, VStack, Text, Button, Alert, AlertIcon } from '@chakra-ui/react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Check if this is a hydration error
    if (error.message.includes('Text content does not match server-rendered HTML') ||
        error.message.includes('Hydration failed') ||
        error.message.includes('hydration')) {
      
      console.log('🔄 Hydration error detected, attempting to recover...');
      
      // Clear potentially problematic localStorage items
      try {
        localStorage.removeItem('currentChatId');
        localStorage.removeItem('chatId');
        localStorage.removeItem('chatSessionsCount');
        console.log('🧹 Cleared localStorage items');
      } catch (e) {
        console.error('Failed to clear localStorage:', e);
      }
      
      // Attempt to recover after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box p={6} minH="100vh" display="flex" alignItems="center" justifyContent="center">
          <VStack spacing={4} maxW="md" textAlign="center">
            <Alert status="error" borderRadius="lg">
              <AlertIcon />
              <Text fontWeight="bold">משהו השתבש</Text>
            </Alert>
            
            <Text color="gray.600">
              {this.state.error?.message.includes('hydration') ? 
                'נתקלנו בבעיה בטעינת הדף. הדף יתחדש אוטומטית...' :
                'נתקלנו בשגיאה בלתי צפויה. אנא נסה שוב.'
              }
            </Text>
            
            <Button
              colorScheme="blue"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
            >
              רענן דף
            </Button>
            
            {process.env.NODE_ENV === 'development' && (
              <Box
                as="details"
                bg="gray.50"
                p={4}
                borderRadius="md"
                fontSize="sm"
                fontFamily="mono"
                textAlign="left"
                maxW="100%"
                overflow="auto"
              >
                <summary>פרטי שגיאה (development)</summary>
                <pre>{this.state.error?.stack}</pre>
              </Box>
            )}
          </VStack>
        </Box>
      );
    }

    return this.props.children;
  }
} 