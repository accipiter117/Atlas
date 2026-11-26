// freePolicySlot: an extra policy card slot of one kind.
//   { "effect": "freePolicySlot", "slot": "wildcard", "amount": 1 }
// The palace gives one wildcard slot in base-ancient. Slots from policy cards
// themselves are ignored (a card cannot make room for itself).

export default {
  name: 'freePolicySlot',
  slots: (e) => (e.source?.kind === 'policy' ? null : { [e.slot]: e.amount }),
};
