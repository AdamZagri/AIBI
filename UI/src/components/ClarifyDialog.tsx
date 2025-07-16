import { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from '@chakra-ui/react';

export interface ClarifyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  missing: { type: string; name: string } | null;
  options: string[];
  onSubmit: (selected: string) => void;
}

export default function ClarifyDialog({
  isOpen,
  onClose,
  missing,
  options,
  onSubmit,
}: ClarifyDialogProps) {
  const [answer, setAnswer] = useState('');

  const handleSubmit = () => {
    onSubmit(answer.trim());
  };

  const title = missing
    ? `לא נמצאה ${missing.type === 'column' ? 'עמודה' : 'טבלה'} בשם "${missing.name}"`
    : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent dir="rtl">
        <ModalHeader fontSize="md">{title}</ModalHeader>
        <ModalBody>
          <Input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            list="clarify_opts"
          />
          {/* datalist must be attached to input list attribute */}
          <datalist id="clarify_opts">
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="brand" onClick={handleSubmit} isDisabled={!answer.trim()}>
            אישור
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
} 