/**
 * The Contract for our Ticket Janitor.
 * This represents the "Payload" that will be stored in Redis
 * while the 10-minute timer is ticking.
 */
export interface ReservationJobData {
  seatId: string;
  userId: string;
  lockKey: string;
}
