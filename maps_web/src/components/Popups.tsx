import { useAccount } from '../account/AccountContext'
import { useAppStore } from '../store'
import { poiToPlace } from '../utils/places'
import { ContextMenu, type MenuAction } from './ContextMenu'
import { PlaceEditor } from './PlaceEditor'

/** The map's context menu, and the "Add a place" form it opens. */
export function Popups() {
  const account = useAccount()
  const menu = useAppStore((s) => s.menu)
  const adding = useAppStore((s) => s.adding)
  const { closeMenu, chooseMenuAction, closeAdding, showPlace } = useAppStore.getState()

  function handleMenuAction(action: MenuAction) {
    if (action === 'add' && !account.user) {
      closeMenu()
      account.requestSignIn()
    } else {
      chooseMenuAction(action)
    }
  }

  return (
    <>
      {adding && (
        <PlaceEditor
          place={null}
          position={adding.position}
          initial={adding.draft}
          onSaved={(details) => {
            closeAdding()
            showPlace(poiToPlace(details))
          }}
          onClose={closeAdding}
        />
      )}

      {menu && (
        <ContextMenu
          key={`${menu.x},${menu.y}`}
          x={menu.x}
          y={menu.y}
          position={menu.position}
          onSelect={handleMenuAction}
          onClose={closeMenu}
        />
      )}
    </>
  )
}
