import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, IconButton, Card, Pill, Input, Select, Textarea, Modal, Drawer, CloseButton, QtyControl, SpiceMeter, TempBadge, Price, Skeleton, Logo, Icon, SectionTitle, EmptyState, ErrorState, Note, PageHeader } from '../../components/ui';
import SnackArt from '../../components/ui/SnackArt';
import { addToast } from '../../store/slices/toast';

const TOKENS = [
  ['Sun yellow', '#FFC300', 'Gradient start, highlights, badges. Dark text on it.'],
  ['Orange', '#FF7A00', 'Gradient middle, primary buttons. Dark text on it.'],
  ['Red', '#E23744', 'Accents, end of gradients.'],
  ['Red text', '#C4222F', 'Small red text on white.'],
  ['Red strong', '#D62839', 'White text only on this or darker.'],
  ['White', '#FFFFFF', 'Surfaces, base of glass.'],
  ['Grey 50', '#F3F4F6', 'Page areas, table stripes.'],
  ['Grey 400', '#9CA3AF', 'Disabled states, icons.'],
  ['Grey 600', '#4B5563', 'Muted text.'],
  ['Grey 800', '#1F2937', 'Main text.'],
  ['Grey 900', '#111827', 'Rider lane, dark backgrounds.'],
];
const SHAPES = ['bajji', 'ball', 'samosa', 'spiral', 'square', 'disc', 'vada', 'bun', 'pile', 'wrap', 'biscuit', 'roll', 'chips'];

/** Design system page (prompt 1.1): tokens, glass, gradients, motion, components. */
export default function DesignSystem() {
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [qty, setQty] = useState(0);
  const dispatch = useDispatch();
  return (
    <div className="page pt-6">
      <SectionTitle eyebrow="SnackHub design system" title="Tokens, glass, motion and components" sub="Doc sections 22.1 to 22.3. Every colour in the app comes from these tokens." />

      <h2 className="mt-12 text-2xl font-bold">Colour tokens</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {TOKENS.map(([n, hex, use]) => (
          <Card key={n} className="overflow-hidden">
            <div className="h-20" style={{ background: hex, borderBottom: '1px solid rgba(0,0,0,.05)' }} />
            <div className="p-3">
              <p className="font-semibold">{n}</p>
              <p className="font-mono text-xs text-grey-600">{hex}</p>
              <p className="mt-1 text-xs text-grey-600">{use}</p>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="mt-12 text-2xl font-bold">Gradients and glass</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="bg-hero grid h-40 place-items-center rounded-[20px] font-display text-xl font-bold text-grey-800">Hero gradient</div>
        <div className="bg-primary grid h-40 place-items-center rounded-[20px] font-display text-xl font-bold text-grey-800">Primary button</div>
        <div className="bg-danger grid h-40 place-items-center rounded-[20px] font-display text-xl font-bold text-white">Danger / strong CTA</div>
      </div>
      <div className="bg-hero relative mt-4 overflow-hidden rounded-[28px] p-8">
        <div className="glass max-w-md p-6">
          <p className="font-display text-2xl font-bold">Glass panel</p>
          <p className="text-grey-800">rgba(255,255,255,.58), blur 16px, saturate 150%. Needs colour behind it. At most three on screen.</p>
        </div>
      </div>
      <p className="mt-4 font-display text-5xl font-bold"><span className="text-gradient">Gradient text, large headings only</span></p>

      <h2 className="mt-12 text-2xl font-bold">Typography</h2>
      <Card className="mt-4 space-y-2 p-6">
        <p className="font-display text-4xl font-bold">Inter for headings and the wordmark</p>
        <p className="text-lg">Inter for text, prices and forms too. Clean and readable at small sizes on cheap phones.</p>
      </Card>

      <h2 className="mt-12 text-2xl font-bold">Buttons and pills</h2>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="dangerOutline">Delete</Button>
        <Button variant="dark">Dark</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="outline">Outline</Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
        <Button size="sm">Small</Button>
        <IconButton label="Notifications" icon="bell" />
        <IconButton label="Add" icon="plus" variant="solid" />
        <IconButton label="Delete" icon="x" variant="danger" size="sm" />
      </div>
      <p className="mt-3 max-w-2xl text-sm text-grey-600">One primary action per screen. Secondary sits beside it. Ghost and quiet go on coloured or busy backgrounds. Danger confirms a destructive action; the outlined one offers it.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Pill tone="sun">Bestseller</Pill><Pill tone="orange">Travels well</Pill><Pill tone="red">Only 2 left</Pill><Pill tone="green">Paid</Pill><Pill tone="dark">Trending</Pill><Pill>Neutral</Pill>
        <TempBadge temp="HOT" /><SpiceMeter level={3} /><Price paise={18000} mrp={22000} />
      </div>

      <h2 className="mt-12 text-2xl font-bold">Inputs, quantity and skeletons</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Input label="Delivery address" placeholder="House no., street" hint="Helper text" />
        <Input label="With error" defaultValue="12" error="Add the street and area" />
        <div className="flex items-end gap-3"><QtyControl qty={qty} onChange={setQty} label="Murukku" /><QtyControl qty={0} disabled onChange={() => {}} label="Sold out item" /></div>
        <Select label="City" defaultValue="hyderabad"><option value="hyderabad">Hyderabad</option><option value="guntur">Guntur</option></Select>
        <Textarea label="Note for the shop" optional maxLength={200} defaultValue="" placeholder="Less spicy, no onion…" hint="The kitchen sees this." />
        <Input label="Disabled" defaultValue="Cannot change" disabled />
      </div>
      <p className="mt-3 max-w-2xl text-sm text-grey-600">Every field is 44 px tall with a 12 px corner. A field written by hand in a page uses the <code>field</code> class to get the same look.</p>
      <div className="mt-4 grid grid-cols-3 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>

      <h2 className="mt-12 text-2xl font-bold">Page title, empty, error and message states</h2>
      <Card className="mt-4 p-5"><PageHeader eyebrow="Seller console" title="Page title" sub="One line that says what this page is for." actions={<Button variant="secondary" size="sm">Action</Button>} /></Card>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card><EmptyState icon="receipt" title="No orders yet" body="What is missing, and the next step." action={<Button>Explore snacks</Button>} /></Card>
        <Card><ErrorState title="We could not load your orders" onRetry={() => {}} /></Card>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Note tone="info">A shop that is not taking orders says so when you add to the cart.</Note>
        <Note tone="success" title="Saved">Your address was updated.</Note>
        <Note tone="warning">Your food licence expires in 12 days.</Note>
        <Note tone="error">That delivery code is not right. 2 tries left.</Note>
      </div>

      <h2 className="mt-12 text-2xl font-bold">Overlays and feedback</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="ghost" onClick={() => setModal(true)}>Open modal</Button>
        <Button variant="ghost" onClick={() => setDrawer(true)}>Open drawer</Button>
        <Button variant="ghost" onClick={() => dispatch(addToast({ title: 'Saved', message: 'A toast message', type: 'success' }))}>Show toast</Button>
        <Button variant="ghost" onClick={() => dispatch(addToast({ title: 'Something failed', message: 'An error toast', type: 'error' }))}>Error toast</Button>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Example modal">
        <div className="relative p-6"><CloseButton onClick={() => setModal(false)} className="absolute right-3 top-3" /><h3 className="text-2xl font-bold">Modal</h3><p className="mt-2 text-grey-600">Focus is trapped; Escape closes; focus returns to the trigger.</p></div>
      </Modal>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Example drawer">
        <div className="flex items-center justify-between p-5"><h3 className="text-2xl font-bold">Drawer</h3><CloseButton onClick={() => setDrawer(false)} /></div>
      </Drawer>

      <h2 className="mt-12 text-2xl font-bold">Snack illustrations</h2>
      <p className="text-grey-600">Placeholders for the AI cut-outs in doc 25.4, labelled as illustrations.</p>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
        {SHAPES.map((s) => (
          <Card key={s} className="p-2 text-center"><SnackArt shape={s} colors={['#E8A23A', '#3F7D20']} className="w-full" /><p className="text-xs font-semibold">{s}</p></Card>
        ))}
      </div>

      <h2 className="mt-12 text-2xl font-bold">Motion</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card className="grid h-40 place-items-center"><div className="w-24 animate-pop-float" style={{ '--r': '-6deg' }}><SnackArt shape="ball" colors={['#F2A516', '#FFD36B']} plate={false} /></div><p className="text-sm text-grey-600">Snack pop-up</p></Card>
        <Card className="lift grid h-40 place-items-center"><p className="font-semibold">Hover lift</p></Card>
        <Card className="grid h-40 place-items-center"><Button className="shine">Button shine on hover</Button></Card>
      </div>
      <p className="mt-2 text-sm text-grey-600">All of these stop under prefers-reduced-motion.</p>


      <div className="mt-12 flex items-center gap-6"><Logo /><Logo compact /><Icon name="scooter" className="h-8 w-8" /></div>
    </div>
  );
}
