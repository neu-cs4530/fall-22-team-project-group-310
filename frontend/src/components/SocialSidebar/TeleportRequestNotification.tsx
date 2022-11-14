import { Box, Button, Tooltip } from '@chakra-ui/react';
import React from 'react';
import useTownController from '../../hooks/useTownController';
import { TeleportRequest } from '../../types/CoveyTownSocket';

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
  const { players, emitTeleportAccepted, emitTeleportDenied } = useTownController();
  const fromPlayer = players.find(player => teleportRequest.fromPlayerId === player.id);

  return (
    <Box>
      <Tooltip label={'Incoming Teleport Requests'}>
        <h3>{fromPlayer?.userName} wants to teleport to you</h3>
      </Tooltip>
      <Button
        marginRight='10px'
        colorScheme='green'
        onClick={() => emitTeleportAccepted(teleportRequest)}>
        Accept
      </Button>
      <Button colorScheme='red' onClick={() => emitTeleportDenied(teleportRequest)}>
        Deny
      </Button>
    </Box>
  );
}
