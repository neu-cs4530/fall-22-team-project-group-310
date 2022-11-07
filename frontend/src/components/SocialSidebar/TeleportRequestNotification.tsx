import { Box, Heading, ListItem, OrderedList, Tooltip } from '@chakra-ui/react';
import React from 'react';
import useTownController from '../../hooks/useTownController';

/**
 * Displays this Player's incoming teleport requests with confirm and deny buttons
 *
 * Relevant emits/listeners:
 */
export default function TeleportRequestNotification(): JSX.Element {
  const townController = useTownController();
  const incomingTeleports = townController.ourPlayer.incomingTeleports;

  const sorted = incomingTeleports.concat([]);
  // sorted.sort((tp1, tp2) => t1.time - tp2.time);

  // todo better way to key list items

  return (
    <Box>
      <Tooltip label={'Incoming Teleport Requests'}>
        <Heading as='h2' fontSize='l'>
          Incoming Teleport Requests
        </Heading>
      </Tooltip>
      <OrderedList>
        {sorted.map(incomingTeleport => (
          <ListItem key={incomingTeleport.fromPlayerId}>{incomingTeleport.fromPlayerId}</ListItem>
        ))}
      </OrderedList>
    </Box>
  );
}
