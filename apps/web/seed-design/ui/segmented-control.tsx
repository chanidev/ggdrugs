/**
 * @file ui:segmented-control
 * @requires @seed-design/react@~1.0.0
 * @requires @seed-design/css@~1.0.0
 **/

import { HStack, SegmentedControl as SeedSegmentedControl } from "@seed-design/react";
import { NotificationBadgePositioner, NotificationBadge } from "@seed-design/react";
import * as React from "react";

export interface SegmentedControlProps extends SeedSegmentedControl.RootProps {}

/**
 * @see https://seed-design.io/react/components/segmented-control
 */
export const SegmentedControl = React.forwardRef<HTMLDivElement, SegmentedControlProps>(
  ({ children, ...otherProps }, ref) => {
    if (!otherProps["aria-label"] && !otherProps["aria-labelledby"]) {
      console.warn(
        "SegmentedControl component requires either an `aria-label` or `aria-labelledby` attribute.",
      );
    }

    if (otherProps.value === undefined && otherProps.defaultValue === undefined) {
      console.warn(
        "SegmentedControl component requires either a `value` or `defaultValue` attribute.",
      );
    }

    return (
      <SeedSegmentedControl.Root ref={ref} {...otherProps}>
        {children}
        {/* 미선택(controlled value="")일 때는 인디케이터(thumb)를 렌더하지 않는다.
            매칭되는 아이템이 없으면 thumb 가 컨트롤 왼쪽 바깥으로 늘어지는 버그 방지.
            값이 선택되면(또는 uncontrolled) 정상적으로 표시·슬라이드된다. */}
        {otherProps.value !== "" && <SeedSegmentedControl.Indicator />}
      </SeedSegmentedControl.Root>
    );
  },
);
SegmentedControl.displayName = "SegmentedControl";

export interface SegmentedControlItemProps extends SeedSegmentedControl.ItemProps {
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;

  rootRef?: React.Ref<HTMLLabelElement>;

  notification?: boolean;
}

/**
 * @see https://seed-design.io/react/components/segmented-control#segmentedcontrolitem
 */
export const SegmentedControlItem = React.forwardRef<HTMLInputElement, SegmentedControlItemProps>(
  ({ children, inputProps, rootRef, notification, ...otherProps }, ref) => {
    return (
      <SeedSegmentedControl.Item ref={rootRef} {...otherProps}>
        <SeedSegmentedControl.ItemHiddenInput ref={ref} {...inputProps} />
        {notification ? (
          <HStack position="relative" align="flex-start">
            {children}
            <NotificationBadgePositioner size="small" attach="text">
              <NotificationBadge />
            </NotificationBadgePositioner>
          </HStack>
        ) : (
          children
        )}
      </SeedSegmentedControl.Item>
    );
  },
);
SegmentedControlItem.displayName = "SegmentedControlItem";

/**
 * This file is a snippet from SEED Design, helping you get started quickly with @seed-design/* packages.
 * You can extend this snippet however you want.
 */
