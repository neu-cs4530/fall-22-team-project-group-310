import { makeStyles, Theme } from '@material-ui/core';
import clsx from 'clsx';
import React from 'react';
import useChatContext from '../../hooks/useChatContext/useChatContext';
import useVideoContext from '../../hooks/useVideoContext/useVideoContext';
import BackgroundSelectionDialog from '../BackgroundSelectionDialog/BackgroundSelectionDialog';
import ChatWindow from '../ChatWindow/ChatWindow';
import ParticipantList from '../ParticipantList/ParticipantList';

const useStyles = makeStyles((theme: Theme) => {
  const totalMobileSidebarHeight = `${
    theme.sidebarMobileHeight + theme.sidebarMobilePadding * 2 + theme.participantBorderWidth
  }px`;
  // return {
  //   container: {
  //     position: 'relative',
  //     height: '100%',
  //     display: 'grid',
  //     gridTemplateColumns: `1fr ${theme.sidebarWidth}px`,
  //     gridTemplateRows: '100%',
  //     [theme.breakpoints.down('sm')]: {
  //       gridTemplateColumns: `100%`,
  //       gridTemplateRows: `calc(100% - ${totalMobileSidebarHeight}) ${totalMobileSidebarHeight}`,
  //     },
  //   },
  //   rightDrawerOpen: { gridTemplateColumns: `1fr ${theme.sidebarWidth}px ${theme.rightDrawerWidth}px` },
  // };
  return {
    container: props => ({
      position: 'relative',
      height: '100%',
      display: 'grid',
      gridTemplateColumns: `1fr ${theme.sidebarWidth}px`,
      gridTemplateRows: '100%',
      [theme.breakpoints.down('sm')]: {
        gridTemplateColumns: '100%',
        // gridTemplateRows: `1fr ${theme.sidebarMobileHeight + 26}px`,
        gridTemplateRows: `calc(100% - ${totalMobileSidebarHeight}) ${totalMobileSidebarHeight}`,
        overflow: 'auto',
      },
    }),
    rightDrawerOpen: {
      gridTemplateColumns: `1fr ${theme.sidebarWidth}px ${theme.rightDrawerWidth}px`,
    },
  };
});

export default function Room() {
  const classes = useStyles();
  const { isChatWindowOpen } = useChatContext();
  const { isBackgroundSelectionOpen, setIsBackgroundSelectionOpen } = useVideoContext();

  return (
    <div
      className={clsx(classes.container, {
        [classes.rightDrawerOpen]: isChatWindowOpen || isBackgroundSelectionOpen,
      })}>
      {/* <MainParticipant /> */}
      <ParticipantList />
      <ChatWindow />
      {isBackgroundSelectionOpen && (
        <BackgroundSelectionDialog
          isBackgroundSelectionOpen={isBackgroundSelectionOpen}
          setIsBackgroundSelectionOpen={setIsBackgroundSelectionOpen}
        />
      )}
    </div>
  );
}
