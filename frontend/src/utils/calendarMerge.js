const primaryBooking = (slot) => slot?.bookings?.[0] || null;

export const sameBookingOwner = (a, b) => {
  if (!a?.booked || !b?.booked) return false;
  const ba = primaryBooking(a);
  const bb = primaryBooking(b);
  if (!ba || !bb) return false;
  if (ba.user_id && bb.user_id) return ba.user_id === bb.user_id;
  if (ba.user_name && bb.user_name) return ba.user_name === bb.user_name;
  return ba.id && bb.id && ba.id === bb.id;
};

export const slotKey = (day, hour) => `${day.toISOString()}:${hour}`;

export const getMergeFlags = (slotGrid, day, hour) => {
  const cur = slotGrid[slotKey(day, hour)];
  const prev = hour > 0 ? slotGrid[slotKey(day, hour - 1)] : null;
  const next = hour < 23 ? slotGrid[slotKey(day, hour + 1)] : null;
  return {
    mergeTop: sameBookingOwner(cur, prev),
    mergeBottom: sameBookingOwner(cur, next),
  };
};

export const mergeClassName = ({ mergeTop, mergeBottom }) => {
  let cls = "";
  if (mergeTop) cls += " calendar-grid__cell--merge-top";
  if (mergeBottom) cls += " calendar-grid__cell--merge-bottom";
  return cls;
};

export const chunkMergeClassName = ({ mergeTop, mergeBottom }) => {
  let cls = "";
  if (mergeTop) cls += " overview-cal__chunk--merge-top";
  if (mergeBottom) cls += " overview-cal__chunk--merge-bottom";
  return cls;
};

export const getRoomChunkMergeFlags = (slotGrid, day, hour, roomId) => {
  const cur = slotGrid[slotKey(day, hour)];
  const prev = hour > 0 ? slotGrid[slotKey(day, hour - 1)] : null;
  const next = hour < 23 ? slotGrid[slotKey(day, hour + 1)] : null;

  const curRoom = cur?.rooms?.find((r) => r.roomId === roomId);
  const prevRoom = prev?.rooms?.find((r) => r.roomId === roomId);
  const nextRoom = next?.rooms?.find((r) => r.roomId === roomId);

  const sameChunk = (left, right) => {
    if (!left || !right) return false;
    const lb = left.bookings?.[0];
    const rb = right.bookings?.[0];
    if (!lb || !rb) return false;
    if (lb.user_id && rb.user_id) return lb.user_id === rb.user_id;
    if (lb.user_name && rb.user_name) return lb.user_name === rb.user_name;
    return lb.id && rb.id && lb.id === rb.id;
  };

  return {
    mergeTop: sameChunk(curRoom, prevRoom),
    mergeBottom: sameChunk(curRoom, nextRoom),
  };
};
