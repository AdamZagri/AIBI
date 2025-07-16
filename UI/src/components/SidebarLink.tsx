'use client';


// src/components/sidebarLink.tsx
import NextLink from 'next/link';
import { Link as ChakraLink, Flex, Icon, Text } from '@chakra-ui/react';
import { ElementType, ReactNode } from 'react';

interface Props {
  href: string;
  icon: ElementType;
  children: ReactNode;
}

export default function SidebarLink({ href, icon, children }: Props) {
  return (
    <ChakraLink
      as={NextLink}          /* Next.js יוצר <a> יחיד */
      href={href}
      display="flex"
      alignItems="center"
      gap={2}
      p={3}
      borderRadius="lg"
      _hover={{ bg: 'gray.100', textDecoration: 'none' }}
      w="100%"
    >
      <Icon as={icon} boxSize={5} />
      <Text fontWeight="medium">{children}</Text>
    </ChakraLink>
  );
}
