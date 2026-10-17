/** Adapter boundary: HID readers send text + Enter to a focused input.
 * A future authenticated device bridge can implement the same callback contract.
 * No chip encoding, direct RF control, or physical hardware verification is implied. */
export interface RFIDReader {
  readonly simulated: boolean
  read(value: string, onRead: (value: string) => void): void
}
export const keyboardWedgeReader: RFIDReader = {
  simulated: false,
  read: (value, onRead) => onRead(value.trim()),
}
export const mockRFIDReader: RFIDReader = {
  simulated: true,
  read: (value, onRead) => onRead(value.trim()),
}
