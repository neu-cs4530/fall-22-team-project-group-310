import {
  Badge,
  Button,
  Heading,
  ListItem,
  OrderedList,
  StackDivider,
  Switch,
  Tooltip,
  useToast,
  VStack,
} from '@chakra-ui/react';
import Block from '@material-ui/icons/Block';
import Cancel from '@material-ui/icons/Cancel';
import MyLocation from '@material-ui/icons/MyLocation';
import React, { useEffect, useState } from 'react';
import PlayerController from '../../classes/PlayerController';
import { usePlayers } from '../../classes/TownController';
import useTownController from '../../hooks/useTownController';
import { TeleportRequest } from '../../types/CoveyTownSocket';
import { PreviousTeleportRequestStatus } from '../../types/TypeUtils';
import PlayerName from './PlayerName';

/**
 * Lists the current players in the town, along with the current town's name and ID
 *
 * See relevant hooks: `usePlayersInTown` and `useCoveyAppState`
 *
 */
export default function PlayersInTownList(): JSX.Element {
  const players = usePlayers();
  const townController = useTownController();
  const { friendlyName, townID, ourPlayer } = townController;
  const sortedPlayers = players.filter(p => p.id !== ourPlayer.id);
  sortedPlayers.sort((p1, p2) =>
    p1.userName.localeCompare(p2.userName, undefined, { numeric: true, sensitivity: 'base' }),
  );
  const [outgoingTeleport, setOutgoingTeleport] = useState<
    TeleportRequest | PreviousTeleportRequestStatus
  >(ourPlayer.outgoingTeleport);
  const [doNotDisturb, setDoNotDisturb] = useState<boolean>(ourPlayer.doNotDisturb);
  const [outgoingTeleportTimer, setOutgoingTeleportTimer] = useState<number | undefined>(
    ourPlayer.outgoingTeleportTimer,
  );
  const toast = useToast();

  useEffect(() => {
    const updateOutgoingTeleport = (
      newOutgoingTeleport: TeleportRequest | PreviousTeleportRequestStatus,
    ) => {
      if (
        typeof newOutgoingTeleport === 'string' &&
        typeof outgoingTeleport !== 'string' &&
        (newOutgoingTeleport === PreviousTeleportRequestStatus.Accepted ||
          newOutgoingTeleport === PreviousTeleportRequestStatus.Denied)
      ) {
        toast({
          title:
            players.find((player: PlayerController) => player.id === outgoingTeleport.toPlayerId)
              ?.userName +
            ' ' +
            newOutgoingTeleport +
            ' your teleport request',
          status: 'info',
        });
      } else if (
        typeof newOutgoingTeleport === 'string' &&
        typeof outgoingTeleport !== 'string' &&
        newOutgoingTeleport === PreviousTeleportRequestStatus.Timeout
      ) {
        toast({
          title:
            'Your teleport request to ' +
            players.find((player: PlayerController) => player.id === outgoingTeleport.toPlayerId)
              ?.userName +
            ' timed out.',
          status: 'info',
        });
      }

      setOutgoingTeleport(newOutgoingTeleport);
    };

    ourPlayer.addListener('outgoingTeleportChange', updateOutgoingTeleport);
    ourPlayer.addListener('doNotDisturbChange', setDoNotDisturb);
    ourPlayer.addListener('outgoingTeleportTimerChange', setOutgoingTeleportTimer);

    return () => {
      ourPlayer.removeListener('outgoingTeleportChange', updateOutgoingTeleport);
      ourPlayer.removeListener('doNotDisturbChange', setDoNotDisturb);
      ourPlayer.addListener('outgoingTeleportTimerChange', setOutgoingTeleportTimer);
    };
  }, [ourPlayer, outgoingTeleport, toast, players]);

  useEffect(() => {
    const successToast = (request: TeleportRequest) => {
      toast({
        title: `
       ${
         request.fromPlayerId === ourPlayer.id
           ? 'You'
           : players.find((player: PlayerController) => player.id === request.fromPlayerId)
               ?.userName
       } 
           successfully teleported to 
          ${
            request.toPlayerId === ourPlayer.id
              ? 'you'
              : players.find((player: PlayerController) => player.id === request.toPlayerId)
                  ?.userName
          }`,
        status: 'success',
      });
    };

    const failedToast = (request: TeleportRequest) => {
      toast({
        title: `
       ${
         request.fromPlayerId === ourPlayer.id
           ? 'You'
           : players.find((player: PlayerController) => player.id === request.fromPlayerId)
               ?.userName
       } 
           failed to teleport to 
          ${
            request.toPlayerId === ourPlayer.id
              ? 'you'
              : players.find((player: PlayerController) => player.id === request.toPlayerId)
                  ?.userName
          }`,
        status: 'error',
      });
    };

    const timeoutToast = (timedoutRequest: TeleportRequest) => {
      toast({
        title:
          'The teleport request from ' +
          players.find((player: PlayerController) => player.id === timedoutRequest.fromPlayerId)
            ?.userName +
          ' timed out.',
        status: 'info',
      });
    };

    townController.addListener('teleportSuccess', successToast);
    townController.addListener('teleportFailed', failedToast);
    townController.addListener('teleportTimeout', timeoutToast);
    return () => {
      townController.removeListener('teleportSuccess', successToast);
      townController.removeListener('teleportFailed', failedToast);
      townController.addListener('teleportTimeout', timeoutToast);
    };
  }, [townController, toast, players, ourPlayer.id]);

  const renderButtons = (player: PlayerController) => {
    if (player.id !== ourPlayer.id) {
      if (typeof outgoingTeleport !== 'string' && outgoingTeleport.toPlayerId === player.id) {
        return (
          <>
            <Button
              onClick={() => {
                townController.emitTeleportCanceled(player.id);
              }}
              leftIcon={<Cancel fontSize='small' />}
              size='xs'
              colorScheme={'red'}
              margin='1.5'
              data-testid='teleportCancelButton'>
              {`Cancel Request`}
            </Button>
            <Badge marginRight={'2'} data-testid='timerDisplay'>
              {outgoingTeleportTimer}
            </Badge>
          </>
        );
      } else {
        return (
          <Button
            onClick={() => {
              townController.emitTeleportRequest(player.id);
              townController.startOutgoingTeleportTimer(30);
            }}
            leftIcon={
              player.doNotDisturb ? <Block fontSize='small' /> : <MyLocation fontSize='small' />
            }
            size='xs'
            colorScheme={'blue'}
            margin='1.5'
            disabled={typeof outgoingTeleport !== 'string' || doNotDisturb || player.doNotDisturb}
            data-testid='teleportRequestButton'>
            {player.doNotDisturb ? 'Do Not Disturb' : 'Teleport Request'}
          </Button>
        );
      }
    }
  };

  return (
    <VStack align={'left'} divider={<StackDivider borderColor='gray.200' />}>
      <Tooltip label={`Town ID: ${townID}`}>
        <Heading as='h2' fontSize='l'>
          Current town: {friendlyName}
        </Heading>
      </Tooltip>
      <OrderedList>
        <ListItem>
          <div style={{ width: '100%' }}>
            <PlayerName player={ourPlayer}></PlayerName> {' (me) '}
          </div>
          <Switch
            colorScheme='blue'
            onChange={() => {
              townController.emitDoNotDisturbChange();
              if (typeof ourPlayer.outgoingTeleport !== 'string') {
                townController.emitTeleportCanceled(ourPlayer.outgoingTeleport.toPlayerId);
              }
              ourPlayer.incomingTeleports.map(request => {
                townController.emitTeleportDenied(request);
              });
            }}
            marginRight={'2'}
            data-testid='doNotDisturbButton'
          />
          {`Do Not Disturb ${ourPlayer.doNotDisturb ? 'On' : 'Off'}`}
        </ListItem>
      </OrderedList>
      {sortedPlayers.length > 0 && (
        <OrderedList>
          {sortedPlayers.map(player => {
            if (player.id !== ourPlayer.id) {
              return (
                <ListItem key={player.id}>
                  <PlayerName player={player} />
                  {renderButtons(player)}
                </ListItem>
              );
            }
          })}
        </OrderedList>
      )}
    </VStack>
  );
}
