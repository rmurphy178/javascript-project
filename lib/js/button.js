import * as Nexus from './NexusUI';


class Button {
  constructor(){
    this.button = new Nexus.TextButton('#button',{
    'size': [150,50],
    'state': false,
    'text': 'PLAY',
    'alternate': false
});
  }

  play(){
    const audio = new Audio('./lib/media/bad_company.mp3');
    audio.play();
  }
}

export default Button;
