import { Box, Heading, ListItem, OrderedList, Tooltip } from '@chakra-ui/react';
import React from 'react';
import useTownController from '../../hooks/useTownController';
import { TeleportRequest } from '../../types/CoveyTownSocket';
import TeleportRequestNotification from './TeleportRequestNotification';

/**
 * Displays this Player's incoming teleport requests with confirm and deny buttons
 *
 * Relevant emits/listeners:
 */
export default function TeleportRequestNotificationsList(): JSX.Element {
  const { ourPlayer, players } = useTownController();
  // const incomingTeleports = townController.ourPlayer.incomingTeleports;
  const incomingTeleports: TeleportRequest[] = [
    { fromPlayerId: players[0].id, toPlayerId: players[1].id, time: new Date() },
  ];

  const sorted: TeleportRequest[] = incomingTeleports.concat([]);
  // sorted.sort((tp1, tp2) => t1.time - tp2.time);

  // todo better way to key list items

  return (
    <Box>
      <Tooltip label={'Incoming Teleport Requests'}>
        <Heading as='h2' fontSize='l'>
          Incoming Teleport Requests
        </Heading>
      </Tooltip>
      {sorted ? (
        <OrderedList>
          {sorted.map((incomingTeleport: TeleportRequest) => (
            <ListItem key={incomingTeleport.fromPlayerId}>
              <TeleportRequestNotification teleportRequest={incomingTeleport} />
            </ListItem>
          ))}
        </OrderedList>
      ) : (
        <>No active conversation areas</>
      )}
    </Box>
  );
}