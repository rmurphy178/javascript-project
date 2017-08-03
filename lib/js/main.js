import * as Nexus from './NexusUI';

import Sequencer from './sequencer';
import Piano from './piano';
import Button from './button';
import Toggle from './toggle'
;

document.addEventListener("DOMContentLoaded", function(){

    const board = new Sequencer();
    const piano = new Piano();
    const button = new Button();
    const toggle = new Toggle();



    button.button.on('change',function(v) {
      button.play();
   });

   toggle.toggle.on('change', (value) => {
     return value === false ? board.sequencer.start() : board.sequencer.stop();
   });


  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContext();

});
