import { Box, Button } from '@chakra-ui/react';
import { ButtonBase } from '@material-ui/core';
import React from 'react';
import useTownController from '../../hooks/useTownController';

/**
 * Displays this Player's incoming teleport requests with confirm and deny buttons
 *
 * Relevant emits/listeners:
 */
export default function TeleportRequestNotification(): JSX.Element {
  const townController = useTownController();
  // const incomingTeleports = townController.ourPlayer.incomingTeleports;
  const incomingTeleports = [{ fromPlayerId: 0, toPlayerId: 1, time: new Date() }];

  const sorted = incomingTeleports.concat([]);
  // sorted.sort((tp1, tp2) => t1.time - tp2.time);

  // todo better way to key list items

  return (
    <Box>
      {/* <Tooltip label={'Incoming Teleport Requests'}></Tooltip> */}
      AHH
      <Button>Chakra Button</Button>
      <ButtonBase>MUI Button</ButtonBase>
    </Box>
  );
}
