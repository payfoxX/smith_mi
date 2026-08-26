import { Router as WouterRouter, Route, Switch } from 'wouter';

import AudioComparePage from './pages/audio-compare';
import ImageComparePage from './pages/image-compare';
import VideoComparePage from './pages/video-compare';

function Router() {
  return (
    <Switch>
      <Route path="/" component={VideoComparePage} />
      <Route path="/video" component={VideoComparePage} />
      <Route path="/audio" component={AudioComparePage} />
      <Route path="/image" component={ImageComparePage} />
      <Route component={VideoComparePage} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Router />
    </WouterRouter>
  );
}

export default App;
