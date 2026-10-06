# Elevation Studio

Christian & Kwan's tool for proposing art to a client. Consultants hang works
on pictures of the client's walls, price them, write about them, and share the
result with the client, who picks and approves. The finished proposal is a
designed document built from the same data.

## People

**C&K**:
Christian & Kwan, the art consultancy that uses Elevation Studio. They have the
final say on house style and on every finished proposal.
_Avoid_: the studio (that is the app), the team

**Consultant**:
A C&K person working in Elevation Studio.
_Avoid_: admin, user

**Client**:
The person or business a project is for. They only ever see the client portal.
_Avoid_: customer, buyer

## Projects and walls

**Project**:
One client's commission. It holds the elevations, works, budget, notes and
proposals for that client.
_Avoid_: job, proposal (see Proposal)

**Elevation**:
One wall or space in the client's property that art is being proposed for.
_Avoid_: space, room (proposal documents may say these; the studio does not)

**Wall**:
The picture of an elevation that works are hung on: either a photograph or a
blank wall.

**Blank wall**:
A wall given as a measured width, height and colour instead of a photograph.
_Avoid_: empty wall (that is an export picture of a wall with nothing hung)

**Option**:
One alternative arrangement of works on an elevation, shown as a letter (A, B,
C…) unless it has been given a name. Options are alternatives, so choosing one
never rejects the works on another.
_Avoid_: version, variant

**Hidden elevation**:
An elevation that the consultant has hidden from the client. It is left out of
the client's view and the client total.

## Works

**Work**:
One artwork the project is considering, whether or not it hangs anywhere. The
same print shown on two options is one work.
_Avoid_: piece, record, artwork (fine in client-facing wording)

**Placement**:
One work hung on one option, with its own position, size on the wall, frame
and mount.
_Avoid_: artwork, hanging

**Artist**:
The maker of a work. An artist is one thing that works belong to, so renaming
an artist renames them everywhere. Two similar names are two artists until
someone says otherwise.

**Unattributed**:
A work that has no artist.

**Standing**:
Where a work is in the project (on a wall, or not placed). It is always worked
out from its placements and never recorded, so it cannot go out of date.
_Avoid_: status

**Set aside**:
A work that someone has explicitly taken out of the running, recorded along with
who did it: *ruled out by us* or *passed by the client*. The reason goes in a
note. It is only a record: a set-aside work stays on any wall it hangs on
until a consultant takes it down.
_Avoid_: declined, rejected

**Earmark**:
The one elevation that a work not yet placed is intended for. It is shown as
"Considered for".

**Index**:
The project's catalogue of artists and works, including those on no wall.

## Client decisions

**Client portal**:
What the client sees when they open their client link: the walls, the budget,
notes written for them, and conversations.

**Client link**:
The private link that opens a project's client portal. Replacing it retires the
old one.

**Shared with client**:
A project whose client link has been given out.
_Avoid_: sent (only a proposal is sent)

**Pick**:
The client's choice of one option on an elevation. They can change it until
they approve.
_Avoid_: select, prefer, choose (the portal says "Choose your option"; the
model says pick)

**Approve**:
The client confirms their pick for an elevation. A project is approved once
every elevation the client can see is approved.

**Conversation**:
The dated messages between the client and C&K about one option.
_Avoid_: client notes, comments

## Money

**Budget**:
The priced view of a project, with a line for each placement plus sub-items,
discounts, VAT and the consultant fee. Consultants work on the *Budget page*;
the client reads the *Budget tab* in the portal.
_Avoid_: Budget screen

**From / Up to**:
The budget's lowest and highest totals while an elevation still has more than
one option in play.
_Avoid_: best case / worst case (it grades the client's own choice)

**Confirmed / TBC**:
Whether a discount has been agreed or is still expected.

**Quoted currency**:
The currency a work's price was given in, such as a US gallery's dollars. The
price is kept as quoted. Wherever the budget shows it in another currency it
is converted at the day's rate and marked as indicative. Every other cost is
in pounds.

**Client currency**:
The one other currency a project's budget can be shown in, with a switch
beside the VAT one. Its figures are indicative: the client pays at their
bank's rate on the day.
_Avoid_: second currency (in client-facing words)

**Choice**:
A budget line the client picks one alternative of, once for the whole
project: framing from two framers, say, or two shippers. The client sees it
under its own name ("Framing: choose one"). Until it is picked, every figure it
touches is a From / Up to range. A project is not approved until every choice
the client is offered has been picked.
_Avoid_: option (that is an arrangement on a wall), variant

**Alternative**:
One of a choice's priced entries, such as a framer's museum glass. Each
belongs to a group labelled as the consultant wants the client to read it
("Framer 1"). An alternative is offered to the client only once it has a price
for every work still in play.
_Avoid_: option, tier

## Notes

**Note**:
A piece of writing attached to exactly one thing: the project, the budget, an
elevation, an option, an artist or a work. A note has no type or role; what it
is attached to decides where it appears.
_Avoid_: comment, remark

**Anchor**:
The one thing a note is attached to.

**Audience**:
Who a note is written for. *Client* notes also show in the client portal
wherever it has a place for them; *C&K* notes do not. Every note goes into the
proposal pack either way.
_Avoid_: private, share, proposal (the old names)

**Budget note**:
A note about money, on one line of the budget: one per work, one per option.
It is written on the Budget page, beside the figures it talks about. The
client reads it only on the Budget tab. The Index and the Notes screen show it
with a link back to its line, or, when the Budget page has no line for it,
let it be edited where it is shown. Anything about a price is a budget note, and
everything else is a Note.
_Avoid_: budget line note, line note

## Proposals

**Proposal pack**:
A zip of one project: a structured document of its chosen walls, works,
budget and notes, plus pictures. A proposal is built from it.
_Avoid_: export (alone), pack

**Proposal**:
The designed, paged document that C&K send to a client, built by the proposal
engine from a proposal pack. Inside the studio and in C&K's own emails it is
only ever the document, never the project. In words the client reads (the
portal, the portal guide), "your proposal" may name what they are shown,
because that is what it is to them.
_Avoid_: deck, presentation

**Version**:
One published state of a proposal. Every edit makes a new version, and earlier
ones are kept.

**Brief**:
What the consultant gives the engine when creating a proposal: which walls and
options to include, which pages, and anything it should know.

**Proposal engine**:
Claude, running in the cloud, which builds a proposal and makes the changes a
consultant asks for in its chat.

**Refresh figures**:
Rebuilds a proposal's prices from the current budget. Prices are never typed
into the chat.

**Sent proposal**:
A version that C&K have marked as sent to the client, optionally with the PDF
exactly as it went out.

**House style**:
C&K's rules for how a proposal looks and reads.

**House-style rule**:
One house-style rule. Claude suggests it from edits or sent proposals, and it
applies only once C&K or Tom approve it.
