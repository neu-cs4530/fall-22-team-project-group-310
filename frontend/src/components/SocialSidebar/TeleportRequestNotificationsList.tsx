import { Box, Heading, ListItem, OrderedList, Tooltip } from '@chakra-ui/react';
import React, { useEffect, useState } from 'react';
import useTownController from '../../hooks/useTownController';
import { TeleportRequest } from '../../types/CoveyTownSocket';
import TeleportRequestNotification from './TeleportRequestNotification';
/**
 * Displays this Player's incoming teleport requests with confirm and deny buttons
 *
 * Relevant emits/listeners:
 * PlayerController: incomingTeleportsChange
 */
export default function TeleportRequestNotificationsList(): JSX.Element {
  const { ourPlayer } = useTownController();
  const [incomingTeleports, setIncomingTeleports] = useState<TeleportRequest[]>(
    ourPlayer.incomingTeleports,
  ); // todo figure out if useState is necessary or if useTownController will force rerender

  // const sortedIncomingTeleports: TeleportRequest[] = incomingTeleports.concat([]);
  // sortedIncomingTeleports.sort((tp1, tp2) => tp1.time.getTime() - tp2.time.getTime());

  // const updateIncomingTeleports = (newIncomingTeleports: TeleportRequest[]) => {
  //   console.log('REEEEEEEEEEEEEEEEEE', incomingTeleports, newIncomingTeleports);
  //   setIncomingTeleports(newIncomingTeleports);
  // };

  useEffect(() => {
    ourPlayer.addListener('incomingTeleportsChange', setIncomingTeleports);
    return () => {
      ourPlayer.removeListener('incomingTeleportsChange', setIncomingTeleports);
    };
  }, [ourPlayer]);

  return (
    <Box>
      <Tooltip label={'Incoming Teleport Requests'}>
        <Heading as='h2' fontSize='l'>
          Incoming Teleport Requests
        </Heading>
      </Tooltip>
      {incomingTeleports.length > 0 ? (
        <OrderedList>
          {incomingTeleports.map((incomingTeleport: TeleportRequest) => (
            <ListItem key={incomingTeleport.fromPlayerId}>
              <TeleportRequestNotification teleportRequest={incomingTeleport} />
            </ListItem>
          ))}
        </OrderedList>
      ) : (
        <>No incoming teleporting requests</>
      )}
    </Box>
  );
}
