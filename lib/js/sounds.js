import * as jsfx from './jsfx';

const Sounds = () => {
const library = {
  "select": {"Volume":{"Sustain":0.1,"Decay":0.15,"Punch":0.55}},
  "long": {"Volume":{"Sustain":0.1,"Decay":0.5,"Punch":1}}
      };
  const sfx = jsfx.Sounds(library);

};

export default Sounds;
