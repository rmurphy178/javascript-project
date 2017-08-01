import Nexus from './nexus';


const dial = new Nexus.Dial('#dial');
const sequencer = new Nexus.Sequencer('#target',{
 'size': [600,300],
 'mode': 'toggle',
 'rows': 8,
 'columns': 16
});
const matrix = new Nexus.Matrix('#matrix');
