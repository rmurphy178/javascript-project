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

  //  board.sequencer.colorize("accent", "#DC143C");

  //  board.sequencer.colorize("fill", "#6495ED");

  const drunk = new Nexus.Drunk();


  board.sequencer.start();
  board.sequencer.stop();

   toggle.toggle.on('change', (value) => {
     return value === true ? board.sequencer.start() : board.sequencer.stop();
   });


   board.sequencer.on('step',function(v) {
   console.log(v);
 });

   board.sequencer.on('change',function(v) {
     const $cells = $("span");
     $cells.addClass('active');
 });

   console.log(board.sequencer.matrix);


  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContext();

  window.piano = piano;

  window.board = board;

});
