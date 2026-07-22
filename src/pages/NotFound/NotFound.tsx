import { useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '../../components/common';
import { Page } from '../../components/layout';
import { Routes } from '../../constants/routes';

export function NotFound() {
  const navigate = useNavigate();
  return (
    <Page>
      <EmptyState
        icon="search"
        title="Page not found"
        description="The page you are looking for doesn’t exist."
        action={
          <Button variant="primary" onClick={() => navigate(Routes.dashboard)}>
            Back to library
          </Button>
        }
      />
    </Page>
  );
}
