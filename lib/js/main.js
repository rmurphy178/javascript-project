import * as Nexus from './NexusUI';

import Sequencer from './sequencer';
import Piano from './piano';
import Button from './button';
import Sounds from './sounds';

document.addEventListener("DOMContentLoaded", function(){

    const board = new Sequencer();
    const piano = new Piano();
    const button = new Button();


    button.button.on('change',function(v) {
      board.sequencer.start();
      button.play();
   });


    board.sequencer.on('step',function(v) {
    console.log(v);
  });



});
