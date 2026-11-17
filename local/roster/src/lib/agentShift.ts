import type {Shift} from '../types/roster';

export function isAgentShift(shift:Shift){
  return shift.agentPreview===true||shift.internalNote?.startsWith('智能体排班 · ')===true;
}
