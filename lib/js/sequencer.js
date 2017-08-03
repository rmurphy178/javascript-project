import * as Nexus from './NexusUI';

class Sequencer {
  constructor(){
    this.sequencer = new Nexus.Sequencer('#sequencer',{
     'size': [1000,500],
     'mode': 'toggle',
     'rows': 8,
     'columns': 16
   });
   this.sequencer.on('change',function(v) {
     const int = Math.floor(Math.random() * (36 -1 + 1)) + 1;
     sfx[int]();
 });
  }
}




export default Sequencer;
