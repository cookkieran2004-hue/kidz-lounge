## The daily schedule

**Schedule** in the top bar opens the day's appointments for every provider. It opens on today, and it updates by itself every 30 seconds.

![The daily schedule](../img/schedule.png)

### Moving between days

- Use the **‹** and **›** arrows beside the date to go back or forward a day.
- Click the date to pick any day from a calendar.
- **Today** brings you back to today.

### Reading the schedule

- Each column is a provider, and each card is an appointment. A card shows the patient, the time and length, the room, and the status.
- The **ST / OT / PT / SI** buttons show only providers of that specialty. Pick more than one to combine them, or **All** for everyone. The app remembers your choice.
- Coloured blocks are time a provider isn't seeing patients: lunch, meetings, PTO and other time off. Click one to see its details.
- A blue line marks the current time.
- A small alert icon on a card means the patient has an allergy or immunization note on their chart.
- A grey dashed **Set room** on a card means it has no room yet. Click it to pick one.
- When a canceled appointment's time has been booked again, the canceled one becomes a narrow **Canceled** strip down the right side, so both can be read.
- Small tags after the patient's name: **MUS** (green) on a canceled session that has a make-up booked, **MU** (green) on a make-up session, and **Eval** (blue) on an evaluation.

### Booking an appointment

1. Click **Create Appointment**.
2. Start typing the patient's name, then pick them from the list.
3. Choose the **provider**, **date**, **time**, **length** and **treatment area** (room).
4. Leave the status as **Scheduled**, or pick another.
5. To book the same slot every week, tick **Repeat weekly**. Then choose how many weeks, or no end date.
6. Click **Create**.

![Booking an appointment](../img/schedule-new-appointment.png)

> Times run from 8:00 AM to 6:00 PM in 15-minute steps.

For a session away from the clinic, choose **Offsite** as the treatment area. Then choose **Center**, **School** or **Home** (billing needs it), and type where, for example the school's name. If a place has been used before, its setting fills in by itself. You can still change it. Offsite is also in the room menu on a card.

If the patient or room is already booked at that time, a yellow **Possible scheduling conflict** box appears. You can still save if it's intentional.

![A double-booking warning](../img/schedule-conflict-warning.png)

If the patient is on the waitlist for that provider's specialty, you'll be asked whether to take them off the waitlist once the appointment is created.

### Changing or cancelling an appointment

Click any appointment card to open it. You can then:

- change the provider, date, time, length, room or status, then click **Save**
- add a **comment**, which everyone who opens the appointment can see
- open the patient's chart with **View Patient Chart**
- **Delete** a mistaken booking. For a no-show or a cancellation, change the status instead, so the history is kept.

![An appointment's details](../img/schedule-appointment-details.png)

For a repeating appointment, you're asked whether a change applies to **this one only** or to **this and all future** appointments. A change to just the room or status only ever applies to that one appointment.

Past appointments can be changed or deleted like any other.

### Moving an appointment by dragging

Drag a card to a new time, or onto another provider's column, to move it there. On a phone or tablet, press and hold the card until it lifts, then drag it.

- A dashed outline shows where it will land, in 15-minute steps.
- To move it to another day, hold the card over the **‹** or **›** arrow at the top until the day changes, then drop it.
- In the **Room** view, dropping a card in another room's column changes its room.
- It's saved as soon as you let go. Click **Undo** in the bar at the bottom of the window to put it back.
- For a repeating appointment, only that day's appointment moves. The rest of the series stays as it is.
- Moving onto time off or another booking is allowed. The usual conflict warnings then appear, so you can fix them.

![Dragging an appointment](../img/schedule-drag.png)

Dragging a **Canceled** or **No Show** appointment doesn't move it. It books a make-up session where you drop it, and the outline turns green. The canceled appointment stays where it was. A canceled appointment that already has a make-up can't be dragged.

### Appointment statuses

| Status | Use it when |
|---|---|
| Scheduled | The appointment is booked. |
| Confirmed | The family has confirmed. |
| Left Message / Emailed | You've reached out but haven't heard back. |
| Canceled | The appointment won't happen. It stays on the record but is greyed out. |
| No Show | The patient didn't come. |
| \*HOLD\* | Time held on a provider's schedule. |

**HOLD - see comments** is a placeholder patient used to hold time on a provider's schedule. Put the reason in the comments. A hold can be booked with several providers at once without counting as a conflict.

### Make-up sessions

Make-ups are booked from the session that was missed. Make Up and MUS are no longer statuses.

1. Open the **Canceled** or **No Show** appointment.
2. Click **Schedule make up**.
3. A booking window opens with the same patient and provider. Change the provider if someone else will see them, choose the date and time, then click **Create**.

- A make-up is booked once, and it doesn't repeat.
- The missed session then shows a green **MUS** tag, and its window says when the make-up is. The make-up shows a green **MU** tag.
- Each missed session can have one make-up. If the make-up is itself canceled, you can book another.
- You can also drag a canceled card to an empty spot to book its make-up there (see [Moving an appointment by dragging](#moving-an-appointment-by-dragging)).
- A canceled HOLD can't have a make-up, because it isn't a real session.

### Meetings and time off on the schedule

Click a coloured block to see who it's for, when, and any notes. Meetings also show who's invited, the agenda, and comments shared with everyone in the meeting. To change the agenda, click **Edit agenda**, make your changes, then **Save agenda**.

![A meeting's details](../img/schedule-meeting.png)

To ask for time off, use **Request Time Off** on the schedule or go to **My time**. See [My time](#my-time).

<!-- only: reception, admin -->
### Rooms and unassigned appointments

The buttons at the top right switch the schedule's layout:

- **Provider:** a column for each provider (the usual view).
- **Room:** a column for each treatment area, to see which rooms are free.
- **Unassigned:** appointments that don't have a room yet. Click **Set room** to give one a room without opening it.

![The room view](../img/schedule-room-view.png)

![Appointments without a room](../img/schedule-unassigned.png)

### Scheduling conflicts

The orange bar under the specialty buttons counts problems in the next two weeks. Click **Show** to list them:

- a provider, room or patient double-booked
- an appointment during a provider's time off or outside their hours
- an appointment on a day the office is closed

Click a conflict to open the appointments involved and fix one. If a conflict is intentional, click **Dismiss** to hide it. The restore button brings dismissed conflicts back.
<!-- end -->
