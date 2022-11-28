import { Badge, Box, Button, Tooltip } from '@chakra-ui/react';
import Block from '@material-ui/icons/Block';
import Check from '@material-ui/icons/Check';
import React, { useEffect, useState } from 'react';
import useTownController from '../../hooks/useTownController';
import { OutgoingTeleportTimerInfo, TeleportRequest } from '../../types/CoveyTownSocket';

/**
 * Displays this Player's incoming teleport requests with confirm and deny buttons
 *
 * Relevant emits/listeners:
 * TownController:
 * teleportAccepted
 * teleportDenied
 */
type TeleportRequestNotificationProps = {
  teleportRequest: TeleportRequest;
};

export default function TeleportRequestNotification({
  teleportRequest,
}: TeleportRequestNotificationProps): JSX.Element {
  const townController = useTownController();
  const { players } = townController;
  const fromPlayer = players.find(player => teleportRequest.fromPlayerId === player.id);

  const [incomingTeleportTimer, setincomingTeleportTimer] = useState<number | undefined>(
    fromPlayer?.outgoingTeleportTimer,
  );

  useEffect(() => {
    const updateIncomingTeleportTimer = (newTimerInfo: OutgoingTeleportTimerInfo) => {
      if (newTimerInfo.playerId === fromPlayer?.id) {
        setincomingTeleportTimer(newTimerInfo.state);
      }
    };

    townController.addListener('incomingTeleportTimerChange', updateIncomingTeleportTimer);

    return () => {
      townController.removeListener('incomingTeleportTimerChange', updateIncomingTeleportTimer);
    };
  }, [townController, fromPlayer]);

  return (
    <Box>
      <Tooltip label={'Incoming Teleport Requests'}>
        <h3>{fromPlayer?.userName} wants to teleport to you</h3>
      </Tooltip>
      <Button
        marginRight='10px'
        colorScheme='green'
        size='sm'
        leftIcon={<Check fontSize='small' />}
        onClick={() => townController.emitTeleportAccepted(teleportRequest)}
        data-testId='teleportAcceptButton'>
        Accept
      </Button>
      <Button
        marginRight='10px'
        colorScheme='red'
        size='sm'
        leftIcon={<Block fontSize='small' />}
        onClick={() => townController.emitTeleportDenied(teleportRequest)}
        data-testId='teleportDenyButton'>
        Deny
      </Button>
      <div style={{ width: '100%' }}>
        {'Time-Out In: '}
        <Badge size='md' data-testid='timerDisplay'>
          {incomingTeleportTimer}
        </Badge>
      </div>
    </Box>
  );
}
