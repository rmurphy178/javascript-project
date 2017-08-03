import * as Nexus from './NexusUI';

import Sequencer from './sequencer';
import Piano from './piano';
import Button from './button';
import { library } from './sounds';

document.addEventListener("DOMContentLoaded", function(){

    const board = new Sequencer();
    const piano = new Piano();
    const button = new Button();



    button.button.on('change',function(v) {
      board.sequencer.start();
      button.play();
   });


    board.sequencer.on('change',function(v) {
      const int = Math.floor(Math.random() * (36 -1 + 1)) + 1;
      sfx[int]();
  });

  piano.piano.on('change', function(v) {
    const int = Math.floor(Math.random() * (36 - 1 + 1)) + 1;
    sfx[int]();
  });

  console.log(piano.piano.keys);

  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioContext();

});
