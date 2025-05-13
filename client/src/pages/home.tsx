import { Helmet } from 'react-helmet';
import MapEditor from '@/components/MapEditor';

export default function Home() {
  return (
    <>
      <Helmet>
        <title>Interactive Map Editor</title>
        <meta name="description" content="Create custom maps with drawing tools that allow modifying roads and areas, saved locally to your browser." />
        <meta property="og:title" content="Interactive Map Editor" />
        <meta property="og:description" content="Create custom maps with drawing tools that allow modifying roads and areas, saved locally to your browser." />
        <meta property="og:type" content="website" />
      </Helmet>
      <MapEditor />
    </>
  );
}
