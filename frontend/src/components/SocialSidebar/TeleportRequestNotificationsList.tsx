import { Box, Heading, ListItem, OrderedList, Tooltip } from '@chakra-ui/react';
import React, { useState } from 'react';
import useTownController from '../../hooks/useTownController';
import { TeleportRequest } from '../../types/CoveyTownSocket';
import TeleportRequestNotification from './TeleportRequestNotification';

/**
 * Displays this Player's incoming teleport requests with confirm and deny buttons
 *
 * Relevant emits/listeners:
 */
export default function TeleportRequestNotificationsList(): JSX.Element {
  const townController = useTownController();
  const [incomingTeleports, setIncomingTeleports] = useState<TeleportRequest[]>(
    townController.ourPlayer.incomingTeleports,
  ); // todo figure out if useState is necessary or if useTownController will force rerender

  const sorted: TeleportRequest[] = incomingTeleports.concat([]);
  sorted.sort((tp1, tp2) => tp1.time.getTime() - tp2.time.getTime());

  // todo better way to key list items

  townController.addListener(
    'outgoingTeleportChange',
    setIncomingTeleports(townController.ourPlayer.incomingTeleports),
  );

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
