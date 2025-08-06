'use client';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect, useState } from 'react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { MenuItem } from '@/app/lib/types';
import Link from 'next/link';

export default function MobileMenu({ menu }: { menu: MenuItem[] }) {
  const [isOpen, setIsOpen] = useState(false);

  const openMobileMenu = () => setIsOpen(true);
  const closeMobileMenu = () => setIsOpen(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      <button
        onClick={openMobileMenu}
        aria-label="Open mobile menu"
        className="md:hidden border border-gray-300 dark:border-neutral-700 rounded-md p-2"
      >
        <Bars3Icon className="h-5 w-5 text-black dark:text-white" />
      </button>
      <Transition show={isOpen} as={Fragment}>
        <Dialog onClose={closeMobileMenu} className="relative z-50">
          <Transition.Child
            as="div"
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          </Transition.Child>

          <Transition.Child
            as="div"
            enter="transition-transform ease-in-out duration-300"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="transition-transform ease-in-out duration-200"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <Dialog.Panel className="fixed inset-0 z-50 w-full max-w-xs bg-white p-4 dark:bg-black">
              <button
                onClick={closeMobileMenu}
                className="mb-4 border border-gray-300 dark:border-neutral-700 rounded-md p-2"
                aria-label="Close menu"
              >
                <XMarkIcon className="h-6 w-6 text-black dark:text-white" />
              </button>

              <div className="mb-4">
              </div>

              <ul className="space-y-4">
                {menu.map((item) => (
                  <li key={item.title}>
                    <Link
                      href={item.path}
                      className="block text-lg text-black dark:text-white hover:text-neutral-500"
                      onClick={closeMobileMenu}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Dialog.Panel>
          </Transition.Child>
        </Dialog>
      </Transition>
    </>
  );
}